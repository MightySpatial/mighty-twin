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
  defined,
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

    // ── Eraser: pick → delete. No draft node, no globe-position
    //     sampling. Each LEFT_CLICK picks a sketch entity by id and
    //     removes the corresponding node. Tool stays active until
    //     the user presses Esc or picks another tool, so a user can
    //     wipe a series of mistakes in one go.
    if (tool.flags.eraser) {
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
      handlerRef.current = handler
      handler.setInputAction((click: { position: Cartesian2 }) => {
        const picked = viewer.scene.pick(click.position) as
          | { id?: unknown }
          | undefined
        if (!picked || !defined(picked)) return
        const idRef = (picked.id ?? null) as { id?: string } | string | null
        const targetId = typeof idRef === 'string' ? idRef : idRef?.id
        if (!targetId || typeof targetId !== 'string') return
        // Sketch node ids live in the engine — only erase if it
        // matches a known node so we don't accidentally delete
        // 3D tilesets or imported layers.
        const state = useCadEngine.getState()
        if (state.nodes[targetId]) state.removeNode(targetId)
      }, ScreenSpaceEventType.LEFT_CLICK)
      return () => teardown()
    }

    // ── Stamp a draft node into the engine if one isn't there yet ──
    if (!draftIdRef.current) {
      const id = generateNodeId()
      draftIdRef.current = id
      const engine = useCadEngine.getState()
      const sketch = engine.sketches[activeSketchId]
      const layer = sketch?.layers.find(l => l.id === activeLayerId) ?? null
      const draft = makeDraftNode(
        id, tool.id, tool.geometryType, activeSketchId, activeLayerId,
        engine.activeTemplateId, layer,
      )
      engine.addNode(draft)
      // Expose the draft id so PlaceModeBar's Parameters / ELEV /
      // ATTRIBUTES / VERTICES sections can read+write the same node.
      engine.setActiveDraftNode(id)
    }

    // ── Subscribe to pointer events ──
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    // Drag-sampled tools (Pen freehand): pointerdown → start sampling;
    // mousemove (while held) → throttle-append; pointerup → commit.
    // Camera controllers are paused for the duration so a swipe draws
    // instead of orbiting the globe.
    if (tool.flags.dragSampled) {
      const ctrl = viewer.scene.screenSpaceCameraController
      const savedRotate = ctrl.enableRotate
      const savedTilt = ctrl.enableTilt
      const savedTranslate = ctrl.enableTranslate
      let drawing = false
      let lastSampleAt = 0
      let lastScreenX = -1e9
      let lastScreenY = -1e9
      // ~30 Hz sample + ≥4px move threshold — keeps strokes smooth
      // without flooding the engine with redundant vertices on a slow
      // drag.
      const MIN_DELTA_MS = 33
      const MIN_DELTA_PX = 4

      handler.setInputAction((evt: { position: Cartesian2 }) => {
        if (drawing) return
        drawing = true
        ctrl.enableRotate = false
        ctrl.enableTilt = false
        ctrl.enableTranslate = false
        sampleAt(evt.position)
      }, ScreenSpaceEventType.LEFT_DOWN)

      handler.setInputAction((evt: { endPosition: Cartesian2 }) => {
        if (!drawing) return
        const now = Date.now()
        const dx = evt.endPosition.x - lastScreenX
        const dy = evt.endPosition.y - lastScreenY
        if (now - lastSampleAt < MIN_DELTA_MS && Math.hypot(dx, dy) < MIN_DELTA_PX) return
        sampleAt(evt.endPosition)
        lastSampleAt = now
      }, ScreenSpaceEventType.MOUSE_MOVE)

      handler.setInputAction(() => {
        if (!drawing) return
        drawing = false
        ctrl.enableRotate = savedRotate
        ctrl.enableTilt = savedTilt
        ctrl.enableTranslate = savedTranslate
        // Auto-commit the stroke. The user can immediately start a
        // new stroke since the tool stays active.
        useCadEngine.getState().setActiveTool(null)
      }, ScreenSpaceEventType.LEFT_UP)

      function sampleAt(screen: Cartesian2) {
        const draftId = draftIdRef.current
        if (!draftId) return
        const pos = pickGlobePosition(viewer!, screen)
        if (!pos) return
        const state = useCadEngine.getState()
        const cur = state.nodes[draftId]
        if (!cur) return
        const positions = [...(cur.params.positions ?? []), pos] as Position[]
        state.updateNodePositions(draftId, positions)
        lastScreenX = screen.x
        lastScreenY = screen.y
      }

      return () => {
        ctrl.enableRotate = savedRotate
        ctrl.enableTilt = savedTilt
        ctrl.enableTranslate = savedTranslate
        teardown()
      }
    }

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
        state.setActiveDraftNode(null)
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
  templateId: string | null,
  layer: import('../sketch/types').SketchLayerSpec | null,
): SketchNode {
  const nodeType: NodeType = (
    toolId === 'pt_box'      ? 'box'
  : toolId === 'pt_pit'      ? 'pit'
  : toolId === 'pt_cylinder' ? 'cylinder'
  : toolId === 'pipe_draw'   ? 'pipe'
  : toolId === 'extrude'     ? 'extrude'
  : toolId === 'loft'        ? 'loft'
  : 'sketch')
  // Inherit the layer's default stroke colour + width so freehand /
  // line / polygon nodes pick up the user's Style row choices
  // without a separate per-node selection step.
  const style: SketchNode['style'] = {}
  if (layer?.colour) style.color = layer.colour
  if (typeof layer?.lineWidth === 'number') style.lineWidth = layer.lineWidth
  return {
    id,
    type: nodeType,
    inputs: [],
    template_id: templateId,
    params: {
      geometry: geometryType,
      positions: [],
      sketchId,
      sketchLayer: layerId,
    },
    attributes: {},
    style,
  }
}
