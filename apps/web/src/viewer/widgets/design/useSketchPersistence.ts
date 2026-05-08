/** Sketch persistence — T+1140.
 *
 *  Bridges the design widget's in-memory layers + features to the
 *  /api/me/sketch-layers backend. On mount: fetch existing rows for
 *  the active site and hydrate state. On change: debounced bulk PUT
 *  that writes the user's full set for this site.
 *
 *  Layer rows carry their own features (so each Twin SketchLayer row
 *  ↔ one design layer). The frontend passes its UUIDs as `id` so
 *  round-trips don't lose object identity.
 *
 *  No autosave on first paint: we wait for at least one user-driven
 *  state change before debouncing. That avoids racing the initial
 *  hydration against a save.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SketchFeature, SketchLayer } from './types'

const API_URL = import.meta.env.VITE_API_URL || ''

interface RemoteSketchLayer {
  id: string
  name: string
  color: string | null
  visible: boolean
  locked: boolean
  features: SketchFeature[]
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Args {
  siteSlug: string | null
  layers: SketchLayer[]
  features: SketchFeature[]
  /** Called with the rows returned from the GET so the design widget
   *  can swap its in-memory state for the persisted set. */
  onHydrate: (layers: SketchLayer[], features: SketchFeature[]) => void
  /** Suspend autosave (e.g. while a tool drag is mid-flight). */
  enabled?: boolean
}

const DEBOUNCE_MS = 1500

export function useSketchPersistence({
  siteSlug,
  layers,
  features,
  onHydrate,
  enabled = true,
}: Args) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const hydrated = useRef(false)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const headers = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('accessToken')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  // ── Hydrate once when siteSlug changes ───────────────────────────
  useEffect(() => {
    if (!siteSlug) return
    hydrated.current = false
    setStatus('idle')
    setLastError(null)
    fetch(
      `${API_URL}/api/me/sketch-layers?site_slug=${encodeURIComponent(siteSlug)}`,
      { headers: headers() },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Hydrate failed (${r.status})`)
        return r.json() as Promise<RemoteSketchLayer[]>
      })
      .then((rows) => {
        if (rows.length === 0) {
          hydrated.current = true
          return
        }
        // Map remote rows → design state shape. Features are stored
        // verbatim — they were serialised by an earlier save and the
        // SketchFeature schema hasn't changed since.
        const newLayers: SketchLayer[] = rows.map((r, idx) => ({
          id: r.id,
          name: r.name,
          colour: r.color ?? '#22D3EE',
          visible: r.visible,
          locked: r.locked,
          order: idx,
          coordMode: 'world',
          fields: [],
        }))
        const flatFeatures: SketchFeature[] = rows.flatMap((r) => r.features ?? [])
        onHydrate(newLayers, flatFeatures)
        hydrated.current = true
      })
      .catch((e) => {
        setStatus('error')
        setLastError((e as Error).message)
        // Even on error allow saves — empty state is fine to write.
        hydrated.current = true
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSlug])

  // ── Schedule autosave on layers/features change ─────────────────
  useEffect(() => {
    if (!siteSlug || !enabled) return
    if (!hydrated.current) return
    dirtyRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveNow().catch(() => undefined)
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, features, siteSlug, enabled])

  const saveNow = useCallback(async () => {
    if (!siteSlug) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setStatus('saving')
    setLastError(null)
    try {
      const featuresByLayer = new Map<string, SketchFeature[]>()
      for (const l of layers) featuresByLayer.set(l.id, [])
      for (const f of features) {
        const arr = featuresByLayer.get(f.layerId)
        if (arr) arr.push(f)
      }
      const body = layers.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.colour ?? null,
        visible: l.visible,
        locked: l.locked,
        features: featuresByLayer.get(l.id) ?? [],
        site_slug: siteSlug,
      }))
      const res = await fetch(`${API_URL}/api/me/sketch-layers`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let msg = `Save failed (${res.status})`
        try {
          msg = JSON.parse(text)?.detail || msg
        } catch {
          /* keep default */
        }
        throw new Error(msg)
      }
      setStatus('saved')
      setLastSavedAt(Date.now())
      dirtyRef.current = false
    } catch (e) {
      setStatus('error')
      setLastError((e as Error).message)
    }
  }, [siteSlug, layers, features, headers])

  return {
    status,
    lastSavedAt,
    lastError,
    isDirty: dirtyRef.current,
    saveNow,
  }
}
