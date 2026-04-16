import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Color,
  Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  CallbackProperty,
  HeightReference,
  PolygonHierarchy,
  Cartesian2,
} from 'cesium'
import { computePolylineDistance, computePolygonArea } from './measureUtils'
import type { MeasureResult } from './types'

export function useMeasure(viewerRef: React.RefObject<CesiumViewerType | null>) {
  const [measureActive, setMeasureActive] = useState(false)
  const [measureRunning, setMeasureRunning] = useState<{ distance: number; points: number } | null>(null)
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null)
  const measurePointsRef = useRef<Cartesian3[]>([])
  const measureCursorRef = useRef<Cartesian3 | null>(null)
  const measureEntitiesRef = useRef<Entity[]>([])
  const measureHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const measureLineRef = useRef<Entity | null>(null)
  const measureActiveRef = useRef(false)

  const cleanupMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (measureHandlerRef.current) {
      measureHandlerRef.current.destroy()
      measureHandlerRef.current = null
    }
    if (viewer) {
      measureEntitiesRef.current.forEach(e => viewer.entities.remove(e))
      if (measureLineRef.current) viewer.entities.remove(measureLineRef.current)
    }
    measureEntitiesRef.current = []
    measureLineRef.current = null
    measurePointsRef.current = []
    measureCursorRef.current = null
    measureActiveRef.current = false
  }, [viewerRef])

  const cancelMeasure = useCallback(() => {
    cleanupMeasure()
    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult(null)
  }, [cleanupMeasure])

  const finishMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const pts = measurePointsRef.current
    if (pts.length < 2) { cancelMeasure(); return }

    const distance = computePolylineDistance(pts)
    const area = pts.length >= 3 ? computePolygonArea(pts) : 0

    // Add closing polygon if 3+ points
    if (pts.length >= 3) {
      const poly = viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(pts),
          material: Color.fromCssColorString('#6366f1').withAlpha(0.15),
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
      measureEntitiesRef.current.push(poly)
    }

    // Remove the dynamic line, replace with static
    if (measureLineRef.current) {
      viewer.entities.remove(measureLineRef.current)
      measureLineRef.current = null
    }
    const staticLine = viewer.entities.add({
      polyline: {
        positions: pts.length >= 3 ? [...pts, pts[0]] : pts,
        width: 3,
        material: Color.fromCssColorString('#6366f1'),
        clampToGround: true,
      },
    })
    measureEntitiesRef.current.push(staticLine)

    // Destroy handler but keep entities visible
    if (measureHandlerRef.current) {
      measureHandlerRef.current.destroy()
      measureHandlerRef.current = null
    }
    measureActiveRef.current = false

    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult({ distance, area, points: pts.length })
  }, [cancelMeasure, viewerRef])

  const startMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (measureActive) { cancelMeasure(); return }

    // Clean up previous result if any
    cleanupMeasure()
    setMeasureResult(null)

    setMeasureActive(true)
    measureActiveRef.current = true
    measurePointsRef.current = []
    measureCursorRef.current = null

    // Dynamic polyline that follows cursor
    measureLineRef.current = viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => {
          const pts = [...measurePointsRef.current]
          if (measureCursorRef.current && pts.length > 0) pts.push(measureCursorRef.current)
          return pts
        }, false),
        width: 3,
        material: Color.fromCssColorString('#6366f1').withAlpha(0.8),
        clampToGround: true,
      },
    })

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    measureHandlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      if (!measureActiveRef.current) return
      const ray = viewer.camera.getPickRay(click.position)
      if (!ray) return
      const pos = viewer.scene.globe.pick(ray, viewer.scene)
      if (!pos) return

      measurePointsRef.current.push(pos)

      // Add point marker
      const pt = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString('#6366f1'),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
      measureEntitiesRef.current.push(pt)

      // Update running distance display
      const d = computePolylineDistance(measurePointsRef.current)
      setMeasureRunning({ distance: d, points: measurePointsRef.current.length })
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!measureActiveRef.current) return
      const ray = viewer.camera.getPickRay(movement.endPosition)
      if (!ray) return
      const pos = viewer.scene.globe.pick(ray, viewer.scene)
      if (pos) measureCursorRef.current = pos
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction(() => {
      if (!measureActiveRef.current) return
      // Double-click adds an extra point via LEFT_CLICK — remove it
      if (measurePointsRef.current.length > 1) {
        measurePointsRef.current.pop()
        const lastPt = measureEntitiesRef.current.pop()
        if (lastPt) viewer.entities.remove(lastPt)
      }
      finishMeasure()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  }, [measureActive, cancelMeasure, cleanupMeasure, finishMeasure, viewerRef])

  // ESC key to cancel measure
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && measureActiveRef.current) {
        cancelMeasure()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelMeasure])

  return {
    measureActive,
    measureRunning,
    measureResult,
    startMeasure,
    cancelMeasure,
    finishMeasure,
    cleanupMeasure,
    setMeasureResult,
  }
}
