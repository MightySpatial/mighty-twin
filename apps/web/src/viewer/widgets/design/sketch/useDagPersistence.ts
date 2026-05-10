/**
 * useDagPersistence — wires the CAD engine to the three-tier sketch store.
 *
 * Mount sequence (spec §1, §9.2):
 *   1. _persistReady = false → engine refuses to write.
 *   2. Read S3 index. Found → fetch each sketch doc, hydrate engine,
 *      clear localStorage recovery. Not found → fall back to
 *      localStorage recovery; replay into engine; flush back to S3.
 *      Both empty → fresh start.
 *   3. _persistReady = true → engine writes flow.
 *
 * Steady state:
 *   • subscribeWithSelector watches `dirtySketches`.
 *   • When the set is non-empty, schedule a 500ms debounced flush.
 *   • Flush iterates dirty sketch ids; for each, write the sketch doc;
 *     after writing, write the updated index; then call markSketchClean.
 *   • Destructive ops set `__deleted__` in dirtySketches — flushed
 *     immediately (no debounce) and trigger a deleteJsonFile.
 *
 * On unmount the timer is cleared but no final flush is forced — any
 * pending dirty work persists in localStorage for the next mount.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useCadEngine } from './useCadEngine'
import {
  buildIndex,
  buildSketchDoc,
  clearLocalRecovery,
  deleteSketchDoc,
  fetchSketchDoc,
  fetchSketchIndex,
  makeFetchIO,
  readLocalRecovery,
  writeLocalRecovery,
  writeSketchDoc,
  writeSketchIndex,
} from './persistence'
import type { PersistenceIO, SketchDoc, SketchNode } from './types'

const FLUSH_DEBOUNCE_MS = 500

export type PersistStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export interface UseDagPersistenceArgs {
  siteId: string | null
  /** Inject for tests. Defaults to a fetch-backed IO. */
  io?: PersistenceIO
}

export function useDagPersistence({ siteId, io }: UseDagPersistenceArgs) {
  const [status, setStatus] = useState<PersistStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ioRef = useRef<PersistenceIO>(io ?? makeFetchIO())
  const mountedRef = useRef(true)

  const setPersistReady = useCadEngine(s => s.setPersistReady)
  const hydrate = useCadEngine(s => s.hydrate)
  const markSketchClean = useCadEngine(s => s.markSketchClean)

  // ── Mount: hydrate ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    if (!siteId) {
      setPersistReady(false)
      return
    }

    let cancelled = false
    setStatus('loading')
    setLastError(null)

    ;(async () => {
      try {
        const index = await fetchSketchIndex(ioRef.current, siteId)
        if (cancelled) return

        if (index && index.sketches.length > 0) {
          // S3 wins.
          const docs = await Promise.all(
            index.sketches.map(s => fetchSketchDoc(ioRef.current, siteId, s.id)),
          )
          if (cancelled) return
          hydrateFromDocs(hydrate, index.activeSketchId, docs.filter((d): d is SketchDoc => d != null))
          clearLocalRecovery(siteId)
        } else {
          // S3 empty — try localStorage recovery.
          const recovery = readLocalRecovery(siteId)
          if (recovery && recovery.sketches.length > 0) {
            hydrateFromDocs(hydrate, recovery.index.activeSketchId, recovery.sketches)
            // Flush recovery up to S3 so future mounts read the canonical
            // store; localStorage is wiped when the flush succeeds.
            await flushAll(ioRef.current, siteId).catch(() => undefined)
            clearLocalRecovery(siteId)
          }
        }
        if (!cancelled) {
          setPersistReady(true)
          setStatus('idle')
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setLastError((e as Error).message)
          // Even on error, allow the engine to make local progress —
          // localStorage will catch new work and the next mount can
          // retry.
          setPersistReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [siteId, setPersistReady, hydrate])

  // ── Steady state: debounced flush on dirtySketches changes ─────────
  const flushNow = useCallback(async () => {
    if (!siteId) return
    const state = useCadEngine.getState()
    if (!state._persistReady) return
    if (state.dirtySketches.size === 0) return

    setStatus('saving')
    setLastError(null)

    try {
      // Mirror to localStorage first — cheap insurance against a half-
      // failed S3 flush.
      const allDocs = Object.values(state.sketches).map(sk =>
        buildSketchDoc(siteId, sk, state.nodes),
      )
      const index = buildIndex(siteId, state.sketches, state.nodes, state.activeSketchId)
      writeLocalRecovery(siteId, index, allDocs)

      // Iterate the dirty set. The `__deleted__` marker means at least
      // one sketch was just removed — we can't tell which one(s) here
      // (the store has already dropped the row); the index update
      // alone will reflect the deletion to the next reader. Best-effort
      // delete of the orphaned blob runs on the next mount when the
      // index is observed to disagree with what's in S3.
      const dirtyIds = Array.from(state.dirtySketches).filter(id => id !== '__deleted__')
      for (const sketchId of dirtyIds) {
        const sk = state.sketches[sketchId]
        if (!sk) {
          await deleteSketchDoc(ioRef.current, siteId, sketchId).catch(() => undefined)
          continue
        }
        const doc = buildSketchDoc(siteId, sk, state.nodes)
        await writeSketchDoc(ioRef.current, doc)
      }
      // Index always written last so a half-failed batch doesn't leave a
      // pointer to a missing sketch doc.
      await writeSketchIndex(ioRef.current, siteId, index)

      // Clear dirty marks for the sketches we wrote.
      for (const id of dirtyIds) markSketchClean(id)
      // Clear the synthetic deleted marker too.
      markSketchClean('__deleted__')

      if (!mountedRef.current) return
      setStatus('saved')
      setLastSavedAt(Date.now())
    } catch (e) {
      if (!mountedRef.current) return
      setStatus('error')
      setLastError((e as Error).message)
    }
  }, [siteId, markSketchClean])

  // Subscribe to dirtySketches changes.
  useEffect(() => {
    const unsub = useCadEngine.subscribe(
      s => s.dirtySketches,
      (dirty) => {
        if (!siteId || dirty.size === 0) return
        // Destructive ops carry the synthetic '__deleted__' marker — flush
        // immediately (no debounce) so the disk doesn't lag the UI.
        if (dirty.has('__deleted__')) {
          if (timerRef.current) clearTimeout(timerRef.current)
          flushNow()
          return
        }
        // Debounce all other writes. Reset the timer on each mutation.
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          flushNow()
        }, FLUSH_DEBOUNCE_MS)
      },
    )
    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [siteId, flushNow])

  return {
    status,
    lastSavedAt,
    lastError,
    /** Force-flush any pending writes. Used by the "save now" button +
     *  the imperative path before logout / navigation. */
    flushNow,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hydrateFromDocs(
  hydrate: ReturnType<typeof useCadEngine.getState>['hydrate'],
  activeSketchId: string | null,
  docs: SketchDoc[],
) {
  const sketches: Record<string, SketchDoc['sketch']> = {}
  const nodes: Record<string, SketchNode> = {}
  for (const d of docs) {
    sketches[d.sketchId] = d.sketch
    for (const n of d.nodes) nodes[n.id] = n
  }
  const firstId = activeSketchId ?? Object.keys(sketches)[0] ?? null
  hydrate({
    sketches,
    nodes,
    outputIds: Object.keys(nodes),
    activeSketchId: firstId,
    activeLayerId: firstId ? sketches[firstId]?.activeLayerId ?? null : null,
  })
}

async function flushAll(io: PersistenceIO, siteId: string): Promise<void> {
  const state = useCadEngine.getState()
  const docs = Object.values(state.sketches).map(sk =>
    buildSketchDoc(siteId, sk, state.nodes),
  )
  const index = buildIndex(siteId, state.sketches, state.nodes, state.activeSketchId)
  for (const doc of docs) await writeSketchDoc(io, doc)
  await writeSketchIndex(io, siteId, index)
}
