/**
 * useSvoEngine — Zustand store for the voxel SVO design system.
 *
 * Mirrors the shape of `useCadEngine` (subscribeWithSelector,
 * StateCreator typing) so renderer hooks can subscribe to slices
 * without re-renders elsewhere.
 *
 * Responsibilities:
 *   • Layer registry (CRUD, active selection)
 *   • Block edits (add/remove/split/merge) routed through svoOps
 *   • Generator registry + apply (evaluateGenerator → setBlock loop)
 *   • Water fill action — delegates to svoOps.waterFill
 *   • Chunk lifecycle (loadChunk / unloadChunk) for the viewport
 *     paginator that streams visible chunks
 *   • Persistence — saveLayer / loadLayer on top of `.esv` JSON
 *
 * Persistence URL convention:
 *   GET    /api/sites/{slug}/voxel-layers/{layerId}   → ESVFile
 *   POST   /api/sites/{slug}/voxel-layers/{layerId}   ← ESVFile
 *
 * The store is intentionally Cesium-free — the renderer (a future
 * `useSvoCesium`) subscribes to `chunks` + `layers[].datum` and
 * reconciles primitives.
 */
import { create, type StateCreator } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  CHUNK_SIZE,
  BASE_BLOCK_SIZE,
  type Block,
  type BlockType,
  type ESVFile,
  type SVOChunk,
  type SVOGenerator,
  type SVOLayer,
  type SVORenderMode,
  type SVOState,
} from './types'
import {
  blockKey,
  chunkKey,
  evaluateGenerator,
  removeBlock as opRemoveBlock,
  setBlock as opSetBlock,
  splitBlock as opSplitBlock,
  mergeBlocks as opMergeBlocks,
  waterFill as opWaterFill,
} from './svoOps'
import { positionToChunkCoords } from './enuMath'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

// ── Public store actions ────────────────────────────────────────────────

export interface SvoEngineActions {
  // Layer registry
  addLayer: (layer: SVOLayer) => void
  removeLayer: (layerId: string) => void
  renameLayer: (layerId: string, name: string) => void
  setActiveLayer: (layerId: string | null) => void

  // Editor settings
  setActiveLevel: (level: number) => void
  setRenderMode: (mode: SVORenderMode) => void

  // Block edits — operate on the active layer.
  addBlock: (block: Block, layerId?: string) => void
  removeBlock: (i: number, j: number, k: number, level: number, layerId?: string) => void
  splitBlock: (i: number, j: number, k: number, level: number, layerId?: string) => void
  mergeBlocks: (i: number, j: number, k: number, level: number, layerId?: string) => void

  // Generator registry
  addGenerator: (layerId: string, generator: SVOGenerator) => void
  removeGenerator: (layerId: string, generatorId: string) => void
  applyGenerator: (layerId: string, generatorId: string) => void

  // High-level fills
  waterFill: (
    layerId: string,
    fillElevationAlt: number,
    level: number,
  ) => void

  // Chunk lifecycle (used by the viewport paginator)
  loadChunk: (chunk: SVOChunk, layerId: string) => void
  unloadChunk: (
    layerId: string,
    ci: number,
    cj: number,
    ck: number,
    level: number,
  ) => void

  // Persistence
  saveLayer: (layerId: string) => Promise<void>
  loadLayer: (siteSlug: string, layerId: string) => Promise<SVOLayer | null>

  // Hydration helper for tests / restore
  hydrate: (next: Partial<Pick<SVOState, 'layers' | 'chunks' | 'activeLayerId' | 'activeLevel' | 'renderMode'>>) => void
}

export type SvoEngine = SVOState & SvoEngineActions

const INITIAL: SVOState = {
  layers: [],
  activeLayerId: null,
  activeLevel: 0,
  renderMode: 'solid',
  chunks: new Map(),
}

const svoEngineCreator: StateCreator<
  SvoEngine,
  [['zustand/subscribeWithSelector', never]]
> = (set, get) => ({
  ...INITIAL,

  // ── Layer registry ────────────────────────────────────────────────
  addLayer: (layer) => {
    set(state => ({
      ...state,
      layers: [...state.layers, layer],
      activeLayerId: state.activeLayerId ?? layer.id,
    }))
  },

  removeLayer: (layerId) => {
    set(state => {
      const layers = state.layers.filter(l => l.id !== layerId)
      // Drop every chunk belonging to this layer.
      const chunks = new Map<string, SVOChunk>()
      const prefix = `${layerId}|`
      for (const [k, v] of state.chunks) {
        if (!k.startsWith(prefix)) chunks.set(k, v)
      }
      return {
        ...state,
        layers,
        chunks,
        activeLayerId: state.activeLayerId === layerId
          ? layers[0]?.id ?? null
          : state.activeLayerId,
      }
    })
  },

  renameLayer: (layerId, name) => {
    set(state => ({
      ...state,
      layers: state.layers.map(l => (l.id === layerId ? { ...l, name } : l)),
    }))
  },

  setActiveLayer: (layerId) => {
    set(state => ({ ...state, activeLayerId: layerId }))
  },

  // ── Editor settings ───────────────────────────────────────────────
  setActiveLevel: (level) => {
    set(state => ({ ...state, activeLevel: level }))
  },
  setRenderMode: (mode) => {
    set(state => ({ ...state, renderMode: mode }))
  },

  // ── Block edits ───────────────────────────────────────────────────
  addBlock: (block, layerId) => {
    const lid = layerId ?? get().activeLayerId
    if (!lid) return
    set(state => ({ ...state, chunks: opSetBlock(state.chunks, lid, block) }))
  },

  removeBlock: (i, j, k, level, layerId) => {
    const lid = layerId ?? get().activeLayerId
    if (!lid) return
    set(state => ({ ...state, chunks: opRemoveBlock(state.chunks, lid, i, j, k, level) }))
  },

  splitBlock: (i, j, k, level, layerId) => {
    const lid = layerId ?? get().activeLayerId
    if (!lid) return
    set(state => ({ ...state, chunks: opSplitBlock(state.chunks, lid, i, j, k, level) }))
  },

  mergeBlocks: (i, j, k, level, layerId) => {
    const lid = layerId ?? get().activeLayerId
    if (!lid) return
    set(state => ({ ...state, chunks: opMergeBlocks(state.chunks, lid, i, j, k, level) }))
  },

  // ── Generator registry ────────────────────────────────────────────
  addGenerator: (layerId, generator) => {
    set(state => ({
      ...state,
      layers: state.layers.map(l =>
        l.id === layerId ? { ...l, generators: [...l.generators, generator] } : l,
      ),
    }))
  },

  removeGenerator: (layerId, generatorId) => {
    set(state => ({
      ...state,
      layers: state.layers.map(l =>
        l.id === layerId
          ? { ...l, generators: l.generators.filter(g => g.id !== generatorId) }
          : l,
      ),
    }))
  },

  applyGenerator: (layerId, generatorId) => {
    const state = get()
    const layer = state.layers.find(l => l.id === layerId)
    if (!layer) return
    const gen = layer.generators.find(g => g.id === generatorId)
    if (!gen) return
    if (gen.type === 'water_fill') {
      const alt = typeof gen.params.fillElevationAlt === 'number'
        ? gen.params.fillElevationAlt as number
        : 0
      set(s => ({
        ...s,
        chunks: opWaterFill(s.chunks, layerId, layer.datum, alt, gen.level),
      }))
      return
    }
    const blocks = evaluateGenerator(gen, layer.datum)
    if (blocks.length === 0) return
    set(s => {
      let next = s.chunks
      for (const b of blocks) next = opSetBlock(next, layerId, b)
      return { ...s, chunks: next }
    })
  },

  waterFill: (layerId, fillElevationAlt, level) => {
    const state = get()
    const layer = state.layers.find(l => l.id === layerId)
    if (!layer) return
    set(s => ({
      ...s,
      chunks: opWaterFill(s.chunks, layerId, layer.datum, fillElevationAlt, level),
    }))
  },

  // ── Chunk lifecycle ───────────────────────────────────────────────
  loadChunk: (chunk, layerId) => {
    const key = chunkKey(chunk.ci, chunk.cj, chunk.ck, chunk.level, layerId)
    set(state => {
      const next = new Map(state.chunks)
      next.set(key, chunk)
      return { ...state, chunks: next }
    })
  },

  unloadChunk: (layerId, ci, cj, ck, level) => {
    const key = chunkKey(ci, cj, ck, level, layerId)
    set(state => {
      if (!state.chunks.has(key)) return state
      const next = new Map(state.chunks)
      next.delete(key)
      return { ...state, chunks: next }
    })
  },

  // ── Persistence ───────────────────────────────────────────────────
  saveLayer: async (layerId) => {
    const state = get()
    const layer = state.layers.find(l => l.id === layerId)
    if (!layer) throw new Error(`saveLayer: layer ${layerId} not found`)
    const file = serializeLayer(state.chunks, layer)
    const token = localStorage.getItem('accessToken')
    const r = await fetch(
      `${API_URL}/api/sites/${encodeURIComponent(layer.siteSlug)}/voxel-layers/${encodeURIComponent(layerId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(file),
      },
    )
    if (!r.ok) throw new Error(`saveLayer: ${r.status}`)
    // Mark every persisted chunk clean. We don't unload — the chunk
    // is still resident; just tell the persistence layer nothing's
    // pending.
    set(s => {
      let mutated = false
      const next = new Map(s.chunks)
      const prefix = `${layerId}|`
      for (const [k, c] of s.chunks) {
        if (!k.startsWith(prefix) || !c.dirty) continue
        next.set(k, { ...c, dirty: false })
        mutated = true
      }
      return mutated ? { ...s, chunks: next } : s
    })
  },

  loadLayer: async (siteSlug, layerId) => {
    const token = localStorage.getItem('accessToken')
    const r = await fetch(
      `${API_URL}/api/sites/${encodeURIComponent(siteSlug)}/voxel-layers/${encodeURIComponent(layerId)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`loadLayer: ${r.status}`)
    const file = await r.json() as ESVFile
    const chunks = deserializeLayer(file, layerId)
    const layer: SVOLayer = {
      id: layerId,
      name: layerId,
      siteSlug,
      scope: 'site',
      datum: file.datum,
      generators: file.generators,
    }
    set(state => {
      // Drop any pre-existing chunks for this layer, then merge in
      // the freshly deserialized ones.
      const next = new Map<string, SVOChunk>()
      const prefix = `${layerId}|`
      for (const [k, v] of state.chunks) {
        if (!k.startsWith(prefix)) next.set(k, v)
      }
      for (const [k, v] of chunks) next.set(k, v)
      const layers = state.layers.find(l => l.id === layerId)
        ? state.layers.map(l => (l.id === layerId ? layer : l))
        : [...state.layers, layer]
      return {
        ...state,
        layers,
        chunks: next,
        activeLayerId: state.activeLayerId ?? layerId,
      }
    })
    return layer
  },

  hydrate: (next) => {
    set(state => ({ ...state, ...next }))
  },
})

export const useSvoEngine = create<SvoEngine>()(subscribeWithSelector(svoEngineCreator))

// ── Serialization helpers ──────────────────────────────────────────────

/** Bundle every block of a layer (across all loaded chunks + levels)
 *  into a single ESVFile. Block order is stable: sorted by
 *  (level, ck, cj, ci, k, j, i) so two saves with the same content
 *  produce byte-identical JSON. */
export function serializeLayer(
  chunks: Map<string, SVOChunk>,
  layer: SVOLayer,
): ESVFile {
  const prefix = `${layer.id}|`
  const blocks: ESVFile['blocks'] = []
  const layerChunks: SVOChunk[] = []
  for (const [k, c] of chunks) if (k.startsWith(prefix)) layerChunks.push(c)
  // Stable order — useful for diffing snapshots.
  layerChunks.sort((a, b) =>
    a.level - b.level || a.ck - b.ck || a.cj - b.cj || a.ci - b.ci,
  )
  for (const c of layerChunks) {
    const cellKeys = [...c.blocks.keys()].sort()
    for (const ck of cellKeys) {
      const b = c.blocks.get(ck)!
      blocks.push({
        i: b.i,
        j: b.j,
        k: b.k,
        level: b.level,
        type: b.type,
        ...(b.materialPreset ? { materialPreset: b.materialPreset } : {}),
        ...(b.faceTextures ? { faceTextures: b.faceTextures } : {}),
        ...(b.attrs ? { attrs: b.attrs } : {}),
      })
    }
  }
  return {
    version: 1,
    datum: layer.datum,
    baseLevelSize: BASE_BLOCK_SIZE,
    generators: layer.generators,
    blocks,
  }
}

/** Inverse of serializeLayer — rebuild chunk Map from a saved file. */
export function deserializeLayer(
  file: ESVFile,
  layerId: string,
): Map<string, SVOChunk> {
  const out = new Map<string, SVOChunk>()
  for (const b of file.blocks) {
    const block: Block = {
      i: b.i,
      j: b.j,
      k: b.k,
      level: b.level,
      type: b.type as BlockType,
      ...(b.materialPreset ? { materialPreset: b.materialPreset } : {}),
      ...(b.faceTextures ? { faceTextures: b.faceTextures } : {}),
      ...(b.attrs ? { attrs: b.attrs } : {}),
    }
    const { ci, cj, ck } = positionToChunkCoords(b.i, b.j, b.k)
    const key = chunkKey(ci, cj, ck, b.level, layerId)
    let chunk = out.get(key)
    if (!chunk) {
      chunk = {
        ci, cj, ck,
        level: b.level,
        blocks: new Map(),
        dirty: false,
        meshDirty: true,
      }
      out.set(key, chunk)
    }
    chunk.blocks.set(blockKey(b.i, b.j, b.k), block)
  }
  return out
}

/** Re-export consts so consumers don't have to import from types.ts
 *  separately when they only need the editor surface. */
export { CHUNK_SIZE, BASE_BLOCK_SIZE }
