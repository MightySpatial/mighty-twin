/**
 * Pure DAG operations — no React, no Cesium, no IO.
 *
 * Mirrors the v1 useCadEngine.js public surface:
 *   - addNode / removeNode (with cascade)
 *   - updateNodeAttributes / updateNodePositions / updateNodeStyle / updateNodeParam
 *   - markDirty + propagateDirty (downstream consumers)
 *   - topoSort
 *
 * Every mutation routes through these helpers so the caller (the
 * Zustand store + the test harness) can verify invariants
 * deterministically without spinning up a Cesium viewer.
 *
 * Spec V1_SPEC.md §1 + §9.2.
 */
import type { CadEngineState, SketchNode, NodeParams, NodeStyle } from './types'

/** Generate a node id matching v1's convention. Short prefix + random
 *  base36 suffix; collisions are vanishingly rare for the workload size
 *  (a single sketch holds ≤ thousands of nodes). */
export function generateNodeId(): string {
  return 'n_' + Math.random().toString(36).slice(2, 10)
}

/** Generate a sketch id — same prefix style. */
export function generateSketchId(): string {
  return 'sketch_' + Math.random().toString(36).slice(2, 10)
}

/** Generate a sketch-layer id. */
export function generateLayerId(): string {
  return 'layer_' + Math.random().toString(36).slice(2, 10)
}

/** Find every node that lists `nodeId` in its `inputs[]`. Used by
 *  cascade-delete and dirty propagation. */
export function findDownstream(
  nodes: Record<string, SketchNode>,
  nodeId: string,
): string[] {
  const out: string[] = []
  for (const n of Object.values(nodes)) {
    if (n.inputs.includes(nodeId)) out.push(n.id)
  }
  return out
}

/** Recursively collect all transitively-downstream nodes including
 *  `nodeId` itself. Used by markDirty + cascade-delete. */
export function collectDownstreamClosure(
  nodes: Record<string, SketchNode>,
  rootId: string,
): Set<string> {
  const visited = new Set<string>()
  const stack: string[] = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const child of findDownstream(nodes, id)) stack.push(child)
  }
  return visited
}

/** Topological sort over the DAG. Nodes with no inputs (or whose inputs
 *  are missing) come first; downstream consumers follow.
 *
 *  v1 uses Kahn's algorithm. Cycles are impossible by construction (the
 *  UI only lets you reference upstream nodes), but if present they're
 *  detected and the offending nodes are appended at the end with a
 *  console warning rather than thrown — matches v1 behaviour. */
export function topoSort(
  nodes: Record<string, SketchNode>,
): string[] {
  const indeg = new Map<string, number>()
  const allIds = Object.keys(nodes)
  for (const id of allIds) indeg.set(id, 0)
  for (const n of Object.values(nodes)) {
    for (const dep of n.inputs) {
      // A node may reference a missing input (e.g. after a cascade
      // delete). Skip those edges so the sort still terminates.
      if (indeg.has(dep)) {
        indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1)
      }
    }
  }

  // Stable order — sort the in-degree-0 set by insertion order so test
  // assertions don't flake on Map iteration quirks.
  const queue: string[] = allIds.filter(id => (indeg.get(id) ?? 0) === 0)
  const out: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    out.push(id)
    for (const child of findDownstream(nodes, id)) {
      const next = (indeg.get(child) ?? 0) - 1
      indeg.set(child, next)
      if (next === 0) queue.push(child)
    }
  }
  // Cycle detection — anything not yet emitted has a cycle.
  for (const id of allIds) {
    if (!out.includes(id)) {
      // eslint-disable-next-line no-console
      console.warn(`[dag] cycle detected involving node ${id}; appending`)
      out.push(id)
    }
  }
  return out
}

/** Mark a node dirty — the node itself plus every transitive downstream
 *  consumer. Returns the set of newly-dirty node ids. */
export function propagateDirty(
  nodes: Record<string, SketchNode>,
  nodeId: string,
): Set<string> {
  return collectDownstreamClosure(nodes, nodeId)
}

// ── Mutations (each returns a fresh state snapshot, no in-place edits) ──

export interface MutationResult<S = CadEngineState> {
  state: S
  dirtyNodeIds: Set<string>
  dirtySketchIds: Set<string>
}

export function addNode(
  state: CadEngineState,
  node: SketchNode,
): MutationResult {
  const sketchId = node.params.sketchId
  if (!sketchId) {
    throw new Error('addNode: node.params.sketchId is required')
  }
  if (!state.sketches[sketchId]) {
    throw new Error(`addNode: sketch ${sketchId} does not exist`)
  }
  if (state.nodes[node.id]) {
    throw new Error(`addNode: node ${node.id} already exists`)
  }

  // Validate inputs reference real nodes — surface mistakes early.
  for (const dep of node.inputs) {
    if (!state.nodes[dep]) {
      throw new Error(`addNode: input ${dep} not found`)
    }
  }

  const nextNodes = { ...state.nodes, [node.id]: node }
  const nextOutputIds = topoSort(nextNodes)
  return {
    state: {
      ...state,
      nodes: nextNodes,
      outputIds: nextOutputIds,
      dirtySketches: new Set([...state.dirtySketches, sketchId]),
    },
    dirtyNodeIds: new Set([node.id]),
    dirtySketchIds: new Set([sketchId]),
  }
}

export function removeNode(
  state: CadEngineState,
  nodeId: string,
): MutationResult {
  const target = state.nodes[nodeId]
  if (!target) return { state, dirtyNodeIds: new Set(), dirtySketchIds: new Set() }

  // Cascade — collect every transitive downstream consumer first, then
  // strip them all in one pass. v1 does the same: deleting a polyline
  // removes its derived pipe + extrude.
  const closure = collectDownstreamClosure(state.nodes, nodeId)
  const nextNodes = { ...state.nodes }
  const dirtySketches = new Set(state.dirtySketches)
  for (const id of closure) {
    const n = nextNodes[id]
    if (n?.params.sketchId) dirtySketches.add(n.params.sketchId)
    delete nextNodes[id]
  }
  // Selection cleared if the deleted node was selected.
  const nextSelected = closure.has(state.selectedNodeId ?? '')
    ? null
    : state.selectedNodeId

  return {
    state: {
      ...state,
      nodes: nextNodes,
      outputIds: topoSort(nextNodes),
      selectedNodeId: nextSelected,
      dirtySketches,
    },
    dirtyNodeIds: closure,
    dirtySketchIds: dirtySketches,
  }
}

function patchNode(
  state: CadEngineState,
  nodeId: string,
  patch: (n: SketchNode) => SketchNode,
): MutationResult {
  const cur = state.nodes[nodeId]
  if (!cur) return { state, dirtyNodeIds: new Set(), dirtySketchIds: new Set() }

  const next = patch(cur)
  const dirty = propagateDirty(state.nodes, nodeId)
  const sketchId = next.params.sketchId
  const dirtySketches = new Set(state.dirtySketches)
  if (sketchId) dirtySketches.add(sketchId)

  return {
    state: {
      ...state,
      nodes: { ...state.nodes, [nodeId]: next },
      dirtySketches,
    },
    dirtyNodeIds: dirty,
    dirtySketchIds: dirtySketches,
  }
}

export function updateNodeAttributes(
  state: CadEngineState,
  nodeId: string,
  attrs: Record<string, unknown>,
): MutationResult {
  return patchNode(state, nodeId, n => ({
    ...n,
    attributes: { ...n.attributes, ...attrs },
  }))
}

/** Replace the node's attributes wholesale — used by the
 *  AttributesEditor when the user removes a key (the merge-style
 *  updater can't drop keys). */
export function replaceNodeAttributes(
  state: CadEngineState,
  nodeId: string,
  attrs: Record<string, unknown>,
): MutationResult {
  return patchNode(state, nodeId, n => ({ ...n, attributes: attrs }))
}

export function updateNodePositions(
  state: CadEngineState,
  nodeId: string,
  positions: NodeParams['positions'],
): MutationResult {
  return patchNode(state, nodeId, n => ({
    ...n,
    params: { ...n.params, positions },
  }))
}

export function updateNodeStyle(
  state: CadEngineState,
  nodeId: string,
  style: Partial<NodeStyle>,
): MutationResult {
  return patchNode(state, nodeId, n => ({
    ...n,
    style: { ...n.style, ...style },
  }))
}

export function updateNodeParam(
  state: CadEngineState,
  nodeId: string,
  patch: Partial<NodeParams>,
): MutationResult {
  return patchNode(state, nodeId, n => ({
    ...n,
    params: { ...n.params, ...patch },
  }))
}

/** Snapshot the mutation-relevant fields for the undo stack. Style /
 *  attributes / params live on each node so a snapshot of `nodes` is
 *  sufficient. */
export function snapshot(state: CadEngineState): {
  sketches: CadEngineState['sketches']
  nodes: CadEngineState['nodes']
  outputIds: string[]
} {
  return {
    sketches: deepClone(state.sketches),
    nodes: deepClone(state.nodes),
    outputIds: [...state.outputIds],
  }
}

function deepClone<T>(value: T): T {
  // Avoid `structuredClone` for IE11 — Vite's target is modern but the
  // engine should remain test-runnable in Vitest's jsdom which doesn't
  // have it everywhere. JSON path is fine for plain data objects (no
  // class instances, no functions, no cyclic refs by construction).
  return JSON.parse(JSON.stringify(value)) as T
}
