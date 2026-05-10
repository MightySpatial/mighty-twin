/**
 * useToolPicks — globe pick handler driving the active tool.
 *
 * When `activeToolId` is non-null:
 *   • Subscribe to LEFT_CLICK on the Cesium canvas.
 *   • On each click, resolve the position to lon/lat/alt.
 *   • Append to the draft node's params.positions.
 *   • If clicksToFinish is reached, commit (clear activeToolId) — the
 *     draft node stays as a permanent node.
 *   • For null clicksToFinish (line / polygon / pipe), the user clicks
 *     the finish button or double-clicks to commit.
 *
 * On unmount or activeToolId clear: handler torn down + draft committed
 * (or rolled back if no positions captured yet).
 *
 * Spec V1_SPEC.md §6 — tool catalogue + click semantics.
 */
import { useEffect, useRef } from 'react'
import {
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer as CesiumViewerType,
} from 'cesium'
import { useCadEngine } from '../sketch/useCadEngine'
import { lookupTool } from '../sketch/tools/registry'
import { generateNodeId } from '../sketch/dagOps'
import type {
  GeometryKind,
  NodeType,
  Position,
  SketchNode,
} from '../sketch/types'

interface Args {
  viewer: CesiumViewerType | null
}

export function useToolPicks({ viewer }: Args) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const draftIdRef = useRef<string | null>(null)
  const activeToolId = useCadEngine(s => s.activeToolId)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)

  useEffect(() => {
    if (!viewer) return
    if (!activeToolId || !activeSketchId || !activeLayerId) {
      // Tool deactivated — tear down + commit/discard the draft.
      teardown()
      return
    }
    const tool = lookupTool(activeToolId)
    if (!tool) return

    // ── Stamp a draft node into the engine if one isn't there yet ──
    if (!draftIdRef.current) {
      const id = generateNodeId()
      draftIdRef.current = id
      const draft = makeDraftNode(id, tool.id, tool.geometryType, activeSketchId, activeLayerId)
      useCadEngine.getState().addNode(draft)
    }

    // ── Subscribe to LEFT_CLICK ──
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const draftId = draftIdRef.current
      if (!draftId) return
      const pos = pickGlobePosition(viewer, click.position)
      if (!pos) return

      const state = useCadEngine.getState()
      const cur = state.nodes[draftId]
      if (!cur) return
      const positions = [...(cur.params.positions ?? []), pos] as Position[]
      state.updateNodePositions(draftId, positions)

      // Auto-commit on click-count tools.
      const target = tool.clicksToFinish
      if (typeof target === 'number' && target > 0 && positions.length >= target) {
        // Cancel handler + clear activeToolId — the draft becomes
        // a permanent node automatically.
        useCadEngine.getState().setActiveTool(null)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    // Double-click finish for vertex-driven tools (line / polygon / curve).
    handler.setInputAction(() => {
      if (tool.clicksToFinish === null) {
        useCadEngine.getState().setActiveTool(null)
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    return () => teardown()

    function teardown() {
      if (handlerRef.current) {
        handlerRef.current.destroy()
        handlerRef.current = null
      }
      // If the draft has no positions, drop it; otherwise leave as
      // a permanent node (the user will see it in History/Features).
      const draftId = draftIdRef.current
      if (draftId) {
        const state = useCadEngine.getState()
        const cur = state.nodes[draftId]
        const positions = cur?.params.positions ?? []
        if (positions.length === 0) {
          state.removeNode(draftId)
        }
        draftIdRef.current = null
      }
    }
  }, [viewer, activeToolId, activeSketchId, activeLayerId])
}

// ── Helpers ──────────────────────────────────────────────────────────────

function pickGlobePosition(viewer: CesiumViewerType, screen: Cartesian2): Position | null {
  const ray = viewer.camera.getPickRay(screen)
  if (!ray) return null
  const hit = viewer.scene.globe.pick(ray, viewer.scene)
    ?? viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid)
  if (!hit) return null
  const carto = Cartographic.fromCartesian(hit)
  return [
    CesiumMath.toDegrees(carto.longitude),
    CesiumMath.toDegrees(carto.latitude),
    carto.height,
  ]
}

function makeDraftNode(
  id: string,
  toolId: string,
  geometryType: GeometryKind,
  sketchId: string,
  layerId: string,
): SketchNode {
  const nodeType: NodeType = (
    toolId === 'pt_box'      ? 'box'
  : toolId === 'pt_pit'      ? 'pit'
  : toolId === 'pt_cylinder' ? 'cylinder'
  : toolId === 'pipe_draw'   ? 'pipe'
  : toolId === 'extrude'     ? 'extrude'
  : toolId === 'loft'        ? 'loft'
  : 'sketch')
  return {
    id,
    type: nodeType,
    inputs: [],
    template_id: null,
    params: {
      geometry: geometryType,
      positions: [],
      sketchId,
      sketchLayer: layerId,
    },
    attributes: {},
    style: {},
  }
}
