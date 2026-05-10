/** Mai voxel-context store — small window-event-backed state.
 *
 *  When a voxel layer becomes active in the design widget, that code
 *  calls `setMaiVoxelContext({ siteSlug, layerName, blockLevel })` and
 *  Mai's chat panel switches its API path from direct-Anthropic-BYOK to
 *  the server-side tool-use route at `/api/mai/chat`. The route
 *  executes the voxel toolset (search_location, terrain_mask,
 *  pyramid_fill, box_fill, water_fill) and streams progress back.
 *
 *  Cross-component state without a store dependency: a window event
 *  bus + a module-level cache that rehydrates on read. The hook
 *  subscribes to the event so React renders react.
 */

import { useEffect, useState } from 'react'

export interface MaiVoxelContext {
  /** Site slug — passed to /api/mai/chat as `site_slug`. */
  siteSlug: string
  /** Active voxel layer name — shown in the indicator pill. */
  layerName: string
  /** Block level (0=12.5cm, 3=1m, 5=4m, 6=8m). Surfaced to the user. */
  blockLevel: number
  /** Optional sketch id, threaded through to the backend so server-side
   *  tools that mutate sketches know which one to target. */
  sketchId?: string
}

const EVENT = 'mai:voxel-context'
let current: MaiVoxelContext | null = null

export function getMaiVoxelContext(): MaiVoxelContext | null {
  return current
}

export function setMaiVoxelContext(ctx: MaiVoxelContext | null): void {
  current = ctx
  window.dispatchEvent(new CustomEvent<MaiVoxelContext | null>(EVENT, { detail: ctx }))
}

export function useMaiVoxelContext(): MaiVoxelContext | null {
  const [state, setState] = useState<MaiVoxelContext | null>(current)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<MaiVoxelContext | null>
      setState(ce.detail)
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])
  return state
}
