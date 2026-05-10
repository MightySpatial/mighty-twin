/** Shared helpers for the Parameters components — a tiny hook that
 *  reads/writes a draft node's params and a `num` field accessor with
 *  fallback. Keeps the per-tool components down to 20–60 lines each.
 *
 *  Each Parameters component is given a draftNodeId by the place-mode
 *  bar; mutations route through the engine's updateNodeParam action so
 *  the standard dirty-propagation + undo stack apply uniformly. */
import { useCadEngine } from '../../useCadEngine'
import type { NodeParams } from '../../types'

export function useDraftParams(draftNodeId: string) {
  const node = useCadEngine(s => s.nodes[draftNodeId])
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)

  function setParam(patch: Partial<NodeParams>): void {
    if (!node) return
    updateNodeParam(draftNodeId, patch)
  }
  return { node, params: (node?.params ?? {}) as NodeParams, setParam }
}

export function num(p: NodeParams, key: keyof NodeParams, fallback: number): number {
  const v = p[key]
  return typeof v === 'number' ? v : fallback
}

export function str(
  p: NodeParams, key: keyof NodeParams, fallback: string,
): string {
  const v = p[key]
  return typeof v === 'string' ? v : fallback
}

export function bool(
  p: NodeParams, key: keyof NodeParams, fallback: boolean,
): boolean {
  const v = p[key]
  return typeof v === 'boolean' ? v : fallback
}
