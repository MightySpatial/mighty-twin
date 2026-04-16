/**
 * MightyTwin — Move Tool
 * Drag-to-move placed SketchFeature entities on the globe.
 * Activates when activeTool === 'select' (Edit tab).
 *
 * Supports all geometry types: point, line, polygon, rectangle, circle,
 * and multi-entity solids (box, pit, cylinder — including hollow variants).
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  ConstantProperty,
  ConstantPositionProperty,
  PolygonHierarchy,
  defined,
  Entity,
} from 'cesium'
import type { DesignTool, SketchFeature, SketchLayer } from '../types'

/** Minimum screen-pixel movement before a click becomes a drag. */
const DRAG_THRESHOLD_PX = 3

interface UseMoveToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  features: SketchFeature[]
  layers: SketchLayer[]
  selectedFeatureId: string | null
  onSelectFeature: (featureId: string | null) => void
}

export function useMoveTool({
  viewer,
  activeTool,
  features,
  layers,
  selectedFeatureId,
  onSelectFeature,
}: UseMoveToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const featuresRef = useRef(features)
  featuresRef.current = features
  const layersRef = useRef(layers)
  layersRef.current = layers

  // Drag state
  const potentialDragRef = useRef(false)
  const draggingRef = useRef(false)
  const dragFeatureRef = useRef<SketchFeature | null>(null)
  const startScreenRef = useRef<Cartesian2 | null>(null)
  const startWorldRef = useRef<Cartesian3 | null>(null)

  // Original positions (snapshotted at drag start) keyed by entity id
  const origSingleRef = useRef<Map<string, Cartesian3>>(new Map())
  const origPolylineRef = useRef<Map<string, Cartesian3[]>>(new Map())
  const origPolygonRef = useRef<Map<string, Cartesian3[]>>(new Map())

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    potentialDragRef.current = false
    draggingRef.current = false
    dragFeatureRef.current = null
    startScreenRef.current = null
    startWorldRef.current = null
    origSingleRef.current.clear()
    origPolylineRef.current.clear()
    origPolygonRef.current.clear()
  }, [])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'select') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    const scene = viewer.scene
    const controller = scene.screenSpaceCameraController

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Find the SketchFeature that owns a Cesium entity (including sub-entities). */
    function findFeature(entity: Entity): SketchFeature | null {
      const eid = entity.id
      for (const f of featuresRef.current) {
        if (f.entityId === eid || eid.startsWith(f.entityId + '_')) return f
      }
      return null
    }

    /** Collect all Cesium entity IDs that belong to a feature. */
    function collectEntityIds(feat: SketchFeature): string[] {
      const base = feat.entityId
      const ids: string[] = []
      for (const ent of viewer!.entities.values) {
        if (ent.id === base || ent.id.startsWith(base + '_')) ids.push(ent.id)
      }
      return ids
    }

    /** Pick a globe position from a screen coordinate (no elevation offset). */
    function pickGlobe(screenPos: Cartesian2): Cartesian3 | null {
      const ray = viewer!.camera.getPickRay(screenPos)
      if (!ray) return null
      let hit = scene.globe.pick(ray, scene) ?? undefined
      if (!hit) hit = scene.pickPosition(screenPos) ?? undefined
      if (!hit) hit = viewer!.camera.pickEllipsoid(screenPos, scene.globe.ellipsoid) ?? undefined
      return hit ?? null
    }

    /** Snapshot original positions for every entity of a feature. */
    function saveOriginals(feat: SketchFeature) {
      origSingleRef.current.clear()
      origPolylineRef.current.clear()
      origPolygonRef.current.clear()
      const time = viewer!.clock.currentTime

      for (const id of collectEntityIds(feat)) {
        const ent = viewer!.entities.getById(id)
        if (!ent) continue

        if (ent.position) {
          const p = ent.position.getValue(time)
          if (p) origSingleRef.current.set(id, Cartesian3.clone(p))
        }
        if (ent.polyline?.positions) {
          const arr = ent.polyline.positions.getValue(time) as Cartesian3[] | undefined
          if (arr) origPolylineRef.current.set(id, arr.map(p => Cartesian3.clone(p)))
        }
        if (ent.polygon?.hierarchy) {
          const h = ent.polygon.hierarchy.getValue(time) as PolygonHierarchy | undefined
          if (h?.positions) origPolygonRef.current.set(id, h.positions.map(p => Cartesian3.clone(p)))
        }
      }
    }

    /** Translate every entity of the feature by `delta` from its original position. */
    function applyDelta(feat: SketchFeature, delta: Cartesian3) {
      for (const id of collectEntityIds(feat)) {
        const ent = viewer!.entities.getById(id)
        if (!ent) continue

        const origPos = origSingleRef.current.get(id)
        if (origPos) {
          ent.position = new ConstantPositionProperty(
            Cartesian3.add(origPos, delta, new Cartesian3()),
          )
        }

        const origPoly = origPolylineRef.current.get(id)
        if (origPoly && ent.polyline) {
          const moved = origPoly.map(p => Cartesian3.add(p, delta, new Cartesian3()));
          (ent.polyline as unknown as Record<string, unknown>).positions = new ConstantProperty(moved)
        }

        const origHier = origPolygonRef.current.get(id)
        if (origHier && ent.polygon) {
          const moved = origHier.map(p => Cartesian3.add(p, delta, new Cartesian3()));
          (ent.polygon as unknown as Record<string, unknown>).hierarchy = new ConstantProperty(new PolygonHierarchy(moved))
        }
      }
    }

    function reEnableCamera() {
      controller.enableRotate = true
      controller.enableTranslate = true
      controller.enableZoom = true
      controller.enableTilt = true
      controller.enableLook = true
    }

    function disableCamera() {
      controller.enableRotate = false
      controller.enableTranslate = false
      controller.enableZoom = false
      controller.enableTilt = false
      controller.enableLook = false
    }

    // ── LEFT_DOWN — begin potential drag ────────────────────────────────

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = scene.pick(click.position)
      if (!defined(picked) || !(picked.id instanceof Entity)) return

      const feat = findFeature(picked.id)
      if (!feat) return

      // Respect layer lock
      const layer = layersRef.current.find(l => l.id === feat.layerId)
      if (layer?.locked) return

      const worldPos = pickGlobe(click.position)
      if (!worldPos) return

      onSelectFeature(feat.id)

      potentialDragRef.current = true
      dragFeatureRef.current = feat
      startScreenRef.current = Cartesian2.clone(click.position)
      startWorldRef.current = Cartesian3.clone(worldPos)
      saveOriginals(feat)
      disableCamera()
    }, ScreenSpaceEventType.LEFT_DOWN)

    // ── MOUSE_MOVE — drag entity ────────────────────────────────────────

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      if (!potentialDragRef.current || !dragFeatureRef.current || !startWorldRef.current || !startScreenRef.current) return

      // Check threshold before entering drag mode
      if (!draggingRef.current) {
        const dist = Cartesian2.distance(move.endPosition, startScreenRef.current)
        if (dist < DRAG_THRESHOLD_PX) return
        draggingRef.current = true
      }

      const currentWorld = pickGlobe(move.endPosition)
      if (!currentWorld) return

      const delta = Cartesian3.subtract(currentWorld, startWorldRef.current, new Cartesian3())
      applyDelta(dragFeatureRef.current, delta)
    }, ScreenSpaceEventType.MOUSE_MOVE)

    // ── LEFT_UP — commit move ───────────────────────────────────────────

    handler.setInputAction(() => {
      reEnableCamera()
      potentialDragRef.current = false
      draggingRef.current = false
      dragFeatureRef.current = null
      startScreenRef.current = null
      startWorldRef.current = null
      origSingleRef.current.clear()
      origPolylineRef.current.clear()
      origPolygonRef.current.clear()
    }, ScreenSpaceEventType.LEFT_UP)

    return cleanup
  }, [viewer, activeTool, onSelectFeature, cleanup])
}
