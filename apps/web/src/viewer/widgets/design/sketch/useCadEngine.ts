/**
 * useCadEngine — Zustand store carrying the design DAG.
 *
 * Faithful port of v1's useCadEngine.js composable. Public surface:
 *   • Sketches: createSketch, deleteSketch, setActiveSketch, renameSketch
 *   • Layers:   addLayer, removeLayer, renameLayer, setLayerColour,
 *               toggleLayerVisibility, toggleLayerLock, setActiveLayer
 *   • Nodes:    addNode, removeNode, updateNodeAttributes,
 *               updateNodePositions, updateNodeStyle, updateNodeParam,
 *               selectNode
 *   • DAG:      rebuild, setLiveHistory
 *   • Undo/redo: undo, redo, canUndo, canRedo (max 100 steps)
 *   • Persist:  setPersistReady, markSketchClean (called by the
 *               persistence hook)
 *
 * The store deliberately holds no Cesium primitives — `useDagCesium`
 * subscribes to dirty events and reconciles entities. Spec §9.2.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  CadEngineState,
  Sketch,
  SketchLayerSpec,
  SketchNode,
  NodeParams,
  NodeStyle,
} from './types'
import {
  addNode as opAddNode,
  removeNode as opRemoveNode,
  updateNodeAttributes as opUpdateAttributes,
  replaceNodeAttributes as opReplaceAttributes,
  updateNodePositions as opUpdatePositions,
  updateNodeStyle as opUpdateStyle,
  updateNodeParam as opUpdateParam,
  generateLayerId,
  generateSketchId,
  snapshot,
  topoSort,
} from './dagOps'

const UNDO_LIMIT = 100

// ── Public store actions ────────────────────────────────────────────────

export interface CadEngineActions {
  // Sketches
  createSketch: (init: { name: string; siteId: string }) => string
  deleteSketch: (sketchId: string) => void
  setActiveSketch: (sketchId: string | null) => void
  renameSketch: (sketchId: string, name: string) => void
  patchSketch: (sketchId: string, patch: Partial<Sketch>) => void

  // Layers
  addLayer: (sketchId: string, layer?: Partial<SketchLayerSpec>) => string
  removeLayer: (sketchId: string, layerId: string) => void
  renameLayer: (sketchId: string, layerId: string, name: string) => void
  setLayerColour: (sketchId: string, layerId: string, colour: string) => void
  toggleLayerVisibility: (sketchId: string, layerId: string) => void
  toggleLayerLock: (sketchId: string, layerId: string) => void
  setActiveLayer: (layerId: string | null) => void

  // Nodes
  addNode: (node: SketchNode) => void
  removeNode: (nodeId: string) => void
  updateNodeAttributes: (nodeId: string, attrs: Record<string, unknown>) => void
  /** Replace attributes wholesale — used by the AttributesEditor to
   *  drop keys (merge can't remove). */
  replaceNodeAttributes: (nodeId: string, attrs: Record<string, unknown>) => void
  updateNodePositions: (nodeId: string, positions: NodeParams['positions']) => void
  updateNodeStyle: (nodeId: string, style: Partial<NodeStyle>) => void
  updateNodeParam: (nodeId: string, patch: Partial<NodeParams>) => void
  selectNode: (nodeId: string | null) => void

  // DAG control
  setLiveHistory: (on: boolean) => void
  rebuild: () => void
  setActiveTool: (toolId: string | null) => void
  /** Set the current draft node id — called by useToolPicks when it
   *  stamps a draft into the engine, cleared on tool teardown. */
  setActiveDraftNode: (nodeId: string | null) => void
  /** Set the active attribute template id — populates AttributesEditor
   *  defaults and is stamped onto the next committed draft. */
  setActiveTemplate: (templateId: string | null) => void

  // Undo / redo
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean

  // Persistence handshake (called by useDagPersistence)
  setPersistReady: (ready: boolean) => void
  markSketchClean: (sketchId: string) => void
  /** Replace whole engine state — used by persistence hydration on mount. */
  hydrate: (next: Partial<Pick<CadEngineState, 'sketches' | 'nodes' | 'outputIds' | 'activeSketchId' | 'activeLayerId'>>) => void
}

export type CadEngine = CadEngineState & CadEngineActions

const INITIAL: CadEngineState = {
  sketches: {},
  nodes: {},
  outputIds: [],
  dirtySketches: new Set(),
  selectedNodeId: null,
  activeSketchId: null,
  activeLayerId: null,
  activeToolId: null,
  activeDraftNodeId: null,
  activeTemplateId: null,
  liveHistoryEnabled: true,
  staleNodeIds: new Set(),
  _persistReady: false,
  undoStack: [],
  redoStack: [],
}

// Internal helper — push the current snapshot to undo, clear redo. Called
// at the START of every mutation so a single ctrl+z reverts that change.
function pushUndo(state: CadEngineState): CadEngineState {
  const stack = [...state.undoStack, snapshot(state)]
  // Cap the stack at UNDO_LIMIT — drop oldest.
  while (stack.length > UNDO_LIMIT) stack.shift()
  return {
    ...state,
    undoStack: stack,
    redoStack: [],
  }
}

// ── Default sketch / layer factories ────────────────────────────────────

const DEFAULT_LAYER_COLOURS = [
  '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f472b6',
  '#fb923c', '#67e8f9', '#6ee7b7',
]

function nextLayerColour(existingCount: number): string {
  return DEFAULT_LAYER_COLOURS[existingCount % DEFAULT_LAYER_COLOURS.length]
}

function makeBlankSketch(id: string, name: string, siteId: string): Sketch {
  const layerId = generateLayerId()
  return {
    id,
    name,
    siteIds: [siteId],
    layers: [{
      id: layerId,
      name: 'Layer 1',
      colour: nextLayerColour(0),
      visible: true,
      locked: false,
      coordMode: 'world',
    }],
    activeLayerId: layerId,
    coordMode: 'world',
    coordCrs: 'EPSG:4326',
    localOrigin: { lon: 0, lat: 0, alt: 0 },
    localRotation: 0,
    heightDatum: 'ellipsoidal',
    fields: [],
  }
}

// ── Store factory ───────────────────────────────────────────────────────

export const useCadEngine = create<CadEngine>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL,

    // ── Sketches ──────────────────────────────────────────────────────
    createSketch: ({ name, siteId }) => {
      const id = generateSketchId()
      const sketch = makeBlankSketch(id, name, siteId)
      set(state => ({
        ...pushUndo(state),
        sketches: { ...state.sketches, [id]: sketch },
        activeSketchId: id,
        activeLayerId: sketch.activeLayerId,
        dirtySketches: new Set([...state.dirtySketches, id]),
      }))
      return id
    },

    deleteSketch: (sketchId) => {
      set(state => {
        if (!state.sketches[sketchId]) return state
        const nextSketches = { ...state.sketches }
        delete nextSketches[sketchId]

        // Cascade — drop every node whose params.sketchId points here.
        const nextNodes: Record<string, SketchNode> = {}
        for (const [id, n] of Object.entries(state.nodes)) {
          if (n.params.sketchId !== sketchId) nextNodes[id] = n
        }

        const nextActive = state.activeSketchId === sketchId
          ? Object.keys(nextSketches)[0] ?? null
          : state.activeSketchId
        const nextActiveLayer = nextActive
          ? nextSketches[nextActive]?.activeLayerId ?? null
          : null

        const dirty = new Set(state.dirtySketches)
        dirty.delete(sketchId)
        dirty.add('__deleted__')  // marker — persistence hook will issue a delete request

        return {
          ...pushUndo(state),
          sketches: nextSketches,
          nodes: nextNodes,
          outputIds: topoSort(nextNodes),
          activeSketchId: nextActive,
          activeLayerId: nextActiveLayer,
          selectedNodeId: state.nodes[state.selectedNodeId ?? '']?.params.sketchId === sketchId
            ? null : state.selectedNodeId,
          dirtySketches: dirty,
        }
      })
    },

    setActiveSketch: (sketchId) => {
      set(state => {
        if (!sketchId || !state.sketches[sketchId]) {
          return { ...state, activeSketchId: null, activeLayerId: null }
        }
        return {
          ...state,
          activeSketchId: sketchId,
          activeLayerId: state.sketches[sketchId].activeLayerId,
        }
      })
    },

    renameSketch: (sketchId, name) => {
      set(state => {
        const cur = state.sketches[sketchId]
        if (!cur) return state
        return {
          ...pushUndo(state),
          sketches: { ...state.sketches, [sketchId]: { ...cur, name } },
          dirtySketches: new Set([...state.dirtySketches, sketchId]),
        }
      })
    },

    patchSketch: (sketchId, patch) => {
      set(state => {
        const cur = state.sketches[sketchId]
        if (!cur) return state
        return {
          ...pushUndo(state),
          sketches: { ...state.sketches, [sketchId]: { ...cur, ...patch } },
          dirtySketches: new Set([...state.dirtySketches, sketchId]),
        }
      })
    },

    // ── Layers ────────────────────────────────────────────────────────
    addLayer: (sketchId, layer) => {
      const sketch = get().sketches[sketchId]
      if (!sketch) throw new Error(`addLayer: sketch ${sketchId} not found`)
      const id = layer?.id ?? generateLayerId()
      const newLayer: SketchLayerSpec = {
        id,
        name: layer?.name ?? `Layer ${sketch.layers.length + 1}`,
        colour: layer?.colour ?? nextLayerColour(sketch.layers.length),
        visible: layer?.visible ?? true,
        locked: layer?.locked ?? false,
        coordMode: layer?.coordMode ?? sketch.coordMode,
        ...layer,
      }
      set(state => ({
        ...pushUndo(state),
        sketches: {
          ...state.sketches,
          [sketchId]: { ...sketch, layers: [...sketch.layers, newLayer] },
        },
        dirtySketches: new Set([...state.dirtySketches, sketchId]),
      }))
      return id
    },

    removeLayer: (sketchId, layerId) => {
      set(state => {
        const cur = state.sketches[sketchId]
        if (!cur) return state
        const layers = cur.layers.filter(l => l.id !== layerId)
        if (layers.length === cur.layers.length) return state
        // Cascade — drop nodes pinned to this layer.
        const nextNodes: Record<string, SketchNode> = {}
        for (const [id, n] of Object.entries(state.nodes)) {
          if (!(n.params.sketchId === sketchId && n.params.sketchLayer === layerId)) {
            nextNodes[id] = n
          }
        }
        const newActive = cur.activeLayerId === layerId
          ? layers[0]?.id ?? ''
          : cur.activeLayerId
        return {
          ...pushUndo(state),
          sketches: {
            ...state.sketches,
            [sketchId]: { ...cur, layers, activeLayerId: newActive },
          },
          nodes: nextNodes,
          outputIds: topoSort(nextNodes),
          activeLayerId: state.activeLayerId === layerId ? newActive : state.activeLayerId,
          dirtySketches: new Set([...state.dirtySketches, sketchId]),
        }
      })
    },

    renameLayer: (sketchId, layerId, name) => {
      patchLayer(set, sketchId, layerId, l => ({ ...l, name }))
    },

    setLayerColour: (sketchId, layerId, colour) => {
      patchLayer(set, sketchId, layerId, l => ({ ...l, colour }))
    },

    toggleLayerVisibility: (sketchId, layerId) => {
      patchLayer(set, sketchId, layerId, l => ({ ...l, visible: !l.visible }))
    },

    toggleLayerLock: (sketchId, layerId) => {
      patchLayer(set, sketchId, layerId, l => ({ ...l, locked: !l.locked }))
    },

    setActiveLayer: (layerId) => {
      set(state => {
        if (!state.activeSketchId) return state
        const cur = state.sketches[state.activeSketchId]
        if (!cur) return state
        return {
          ...state,
          activeLayerId: layerId,
          sketches: {
            ...state.sketches,
            [cur.id]: { ...cur, activeLayerId: layerId ?? '' },
          },
        }
      })
    },

    // ── Nodes ─────────────────────────────────────────────────────────
    addNode: (node) => {
      set(state => {
        const result = opAddNode(state, node)
        return { ...pushUndo(state), ...result.state }
      })
    },
    removeNode: (nodeId) => {
      set(state => {
        const result = opRemoveNode(state, nodeId)
        return { ...pushUndo(state), ...result.state }
      })
    },
    updateNodeAttributes: (nodeId, attrs) => {
      set(state => {
        const result = opUpdateAttributes(state, nodeId, attrs)
        return { ...pushUndo(state), ...result.state }
      })
    },
    replaceNodeAttributes: (nodeId, attrs) => {
      set(state => {
        const result = opReplaceAttributes(state, nodeId, attrs)
        return { ...pushUndo(state), ...result.state }
      })
    },
    updateNodePositions: (nodeId, positions) => {
      set(state => {
        const result = opUpdatePositions(state, nodeId, positions)
        return { ...pushUndo(state), ...result.state }
      })
    },
    updateNodeStyle: (nodeId, style) => {
      set(state => {
        const result = opUpdateStyle(state, nodeId, style)
        return { ...pushUndo(state), ...result.state }
      })
    },
    updateNodeParam: (nodeId, patch) => {
      set(state => {
        const result = opUpdateParam(state, nodeId, patch)
        return { ...pushUndo(state), ...result.state }
      })
    },

    selectNode: (nodeId) => {
      set(state => ({ ...state, selectedNodeId: nodeId }))
    },

    // ── DAG control ───────────────────────────────────────────────────
    setLiveHistory: (on) => set(state => ({ ...state, liveHistoryEnabled: on })),
    rebuild: () => {
      // Clear staleNodeIds — caller (Cesium reconciler) re-evaluates.
      set(state => ({
        ...state,
        outputIds: topoSort(state.nodes),
        staleNodeIds: new Set(),
      }))
    },
    setActiveTool: (toolId) => set(state => ({
      ...state,
      activeToolId: toolId,
      // Tool-switch clears any in-flight draft pointer; useToolPicks
      // owns the lifecycle and re-stamps via setActiveDraftNode.
      activeDraftNodeId: toolId === null ? null : state.activeDraftNodeId,
    })),
    setActiveDraftNode: (nodeId) => set(state => ({ ...state, activeDraftNodeId: nodeId })),
    setActiveTemplate: (templateId) => set(state => ({ ...state, activeTemplateId: templateId })),

    // ── Undo / redo ───────────────────────────────────────────────────
    undo: () => {
      const state = get()
      if (state.undoStack.length === 0) return false
      const prev = state.undoStack[state.undoStack.length - 1]
      const redoSnap = snapshot(state)
      set({
        ...state,
        sketches: prev.sketches,
        nodes: prev.nodes,
        outputIds: prev.outputIds,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, redoSnap],
        // Mark every sketch dirty so persistence + Cesium re-sync.
        dirtySketches: new Set(Object.keys(prev.sketches)),
      })
      return true
    },
    redo: () => {
      const state = get()
      if (state.redoStack.length === 0) return false
      const next = state.redoStack[state.redoStack.length - 1]
      const undoSnap = snapshot(state)
      set({
        ...state,
        sketches: next.sketches,
        nodes: next.nodes,
        outputIds: next.outputIds,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, undoSnap],
        dirtySketches: new Set(Object.keys(next.sketches)),
      })
      return true
    },
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // ── Persistence handshake ─────────────────────────────────────────
    setPersistReady: (ready) => set(state => ({ ...state, _persistReady: ready })),
    markSketchClean: (sketchId) => {
      set(state => {
        if (!state.dirtySketches.has(sketchId)) return state
        const next = new Set(state.dirtySketches)
        next.delete(sketchId)
        return { ...state, dirtySketches: next }
      })
    },
    hydrate: (next) => {
      set(state => ({
        ...state,
        ...next,
        // Hydration is the trusted load — clear undo/redo + dirty.
        undoStack: [],
        redoStack: [],
        dirtySketches: new Set(),
        outputIds: topoSort(next.nodes ?? state.nodes),
      }))
    },
  })),
)

// Helper: layer-level patcher used by the four small layer actions.
function patchLayer(
  set: (
    partial: CadEngineState | ((s: CadEngineState) => Partial<CadEngineState>),
  ) => void,
  sketchId: string,
  layerId: string,
  patch: (l: SketchLayerSpec) => SketchLayerSpec,
): void {
  set(state => {
    const cur = state.sketches[sketchId]
    if (!cur) return state
    const layers = cur.layers.map(l => (l.id === layerId ? patch(l) : l))
    return {
      ...pushUndo(state),
      sketches: { ...state.sketches, [sketchId]: { ...cur, layers } },
      dirtySketches: new Set([...state.dirtySketches, sketchId]),
    }
  })
}
