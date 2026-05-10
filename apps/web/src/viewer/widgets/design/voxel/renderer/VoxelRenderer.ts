/** Top-level voxel renderer. Holds a Map of `chunkKey → ChunkPrimitive`
 *  scoped to the active SVOLayer. The React hook below mounts /
 *  unmounts it against the live Cesium viewer ref and feeds it
 *  whatever shape of authoring state the SVO module emits.
 *
 *  Render mode is a stub today — solid is the only path that draws.
 *  `textured` and `raytrace` are accepted but downgrade to solid so
 *  the design widget can wire its UI toggle without crashing. */

import { useEffect, useRef } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { ChunkPrimitive, type ChunkPrimitiveOptions } from './ChunkPrimitive'
import type { RenderMode, SVOChunk, SVOLayer } from '../types'

/** Compose the unique key Cesium primitives are tracked under. We
 *  scope by layer + chunk coords + level so two layers' chunks at
 *  the same logical address don't collide. */
export function chunkKey(layer: SVOLayer, chunk: SVOChunk): string {
  return `${layer.id}::${chunk.ci}|${chunk.cj}|${chunk.ck}|${chunk.level}`
}

export interface VoxelRendererOptions extends ChunkPrimitiveOptions {
  /** Initial render mode. Defaults to `'solid'`. */
  mode?: RenderMode
}

/** Imperative renderer. Construct once per design session, attach to
 *  a viewer, then call `sync` whenever the authoring layer/chunks
 *  change. The React hook at the bottom of this file is the usual
 *  consumer; bare imperative use is supported for tests. */
export class VoxelRenderer {
  private viewer: CesiumViewer | null = null
  private prims = new Map<string, ChunkPrimitive>()
  private mode: RenderMode
  private opts: VoxelRendererOptions

  constructor(opts: VoxelRendererOptions = {}) {
    this.opts = opts
    this.mode = opts.mode ?? 'solid'
  }

  attach(viewer: CesiumViewer): void {
    if (this.viewer === viewer) return
    if (this.viewer) this.detach()
    this.viewer = viewer
  }

  detach(): void {
    this.prims.forEach((p) => p.destroy())
    this.prims.clear()
    this.viewer = null
  }

  /** Drop chunks that are no longer in the active layer; build / patch
   *  ones that are. The caller passes the current SVOLayer plus the
   *  list of chunks belonging to it; chunks for inactive layers are
   *  not the renderer's concern.
   *
   *  Sync is the only public entry point for streaming updates — it's
   *  cheap when nothing changed (every chunk is already mounted and
   *  not meshDirty) and expensive only when meshDirty flips, which
   *  is also when the upstream data layer is doing real work. */
  sync(layer: SVOLayer, chunks: SVOChunk[]): void {
    if (!this.viewer) return

    // The renderer currently only honours `solid`. Other modes are
    // accepted by the API but render the same way; the UI layer can
    // distinguish modes via `setRenderMode` and we'll branch here
    // when textured / raytrace land.
    const _mode = this.mode
    void _mode

    const seen = new Set<string>()
    const scene = this.viewer.scene

    for (const chunk of chunks) {
      const key = chunkKey(layer, chunk)
      seen.add(key)
      let prim = this.prims.get(key)
      if (!prim) {
        prim = new ChunkPrimitive(scene, this.opts)
        this.prims.set(key, prim)
        prim.build(chunk, layer)
        chunk.meshDirty = false
        continue
      }
      if (chunk.meshDirty) {
        prim.update(chunk, layer)
        chunk.meshDirty = false
      }
    }

    // Reap any primitive whose chunk dropped out of the layer.
    this.prims.forEach((prim, key) => {
      if (!seen.has(key)) {
        prim.destroy()
        this.prims.delete(key)
      }
    })
  }

  setRenderMode(mode: RenderMode): void {
    if (this.mode === mode) return
    this.mode = mode
    // Future: trigger a sync re-mount when textured/raytrace need
    // alternate appearances. For solid (default) the existing
    // primitives already match.
  }

  getRenderMode(): RenderMode {
    return this.mode
  }

  /** Diagnostic — number of currently mounted chunk primitives. */
  size(): number {
    return this.prims.size
  }
}

/** State the React hook expects. Loose by design — the SVO authoring
 *  module owns the canonical state shape, and the renderer only needs
 *  the active layer + its chunks. */
export interface VoxelRendererState {
  activeLayer: SVOLayer | null
  chunks: SVOChunk[]
  mode?: RenderMode
}

/** React hook — mounts a VoxelRenderer against the viewer ref and
 *  re-syncs whenever the active layer or chunk list changes. The
 *  renderer detaches on unmount or when the viewer ref clears.
 *
 *  Pass a stable React ref for `viewerRef`. The hook polls .current
 *  inside an effect that also depends on the state, so a viewer that
 *  mounts asynchronously after first render is picked up on the next
 *  render of the consuming component. */
export function useVoxelRenderer(
  viewerRef: React.RefObject<CesiumViewer | null>,
  state: VoxelRendererState,
): void {
  const rendererRef = useRef<VoxelRenderer | null>(null)

  // Lazy-init the renderer once. We keep a single instance for the
  // lifetime of the consuming component so chunk primitives survive
  // shallow state churn (only `sync` decides what to keep).
  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = new VoxelRenderer({ mode: state.mode })
    }
    return () => {
      rendererRef.current?.detach()
      rendererRef.current = null
    }
    // Intentionally empty deps — we want one renderer instance per
    // mount. Mode and state changes are handled by the second effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Attach / sync on every state change. Re-attaches if the viewer
  // ref changes (e.g. Cesium reset by the host).
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const viewer = viewerRef.current
    if (!viewer) return

    renderer.attach(viewer)
    if (state.mode) renderer.setRenderMode(state.mode)

    if (state.activeLayer) {
      renderer.sync(state.activeLayer, state.chunks)
    } else {
      // No active layer → drop any mounted chunks. Equivalent to a
      // sync against an empty list, but skips the per-chunk loop.
      renderer.detach()
      renderer.attach(viewer)
    }
  }, [viewerRef, state.activeLayer, state.chunks, state.mode])
}
