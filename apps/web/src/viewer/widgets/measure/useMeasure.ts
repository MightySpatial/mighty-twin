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
import {
  computePolylineDistance,
  computeSegmentDistances,
  computePolygonArea,
  cartesianToPoint,
} from './measureUtils'
import type { MeasureMode, MeasureResult } from './types'

export function useMeasure(viewerRef: React.RefObject<CesiumViewerType | null>) {
  const [measureMode, _setMeasureMode] = useState<MeasureMode>('line')
  const [measureActive, setMeasureActive] = useState(false)
  const [measureRunning, setMeasureRunning] = useState<{ distance: number; points: number } | null>(null)
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null)
  const measureModeRef = useRef<MeasureMode>('line')
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
    const mode = measureModeRef.current

    if (mode === 'point') {
      if (pts.length < 1) { cancelMeasure(); return }
      const point = cartesianToPoint(pts[0])
      if (measureHandlerRef.current) {
        measureHandlerRef.current.destroy()
        measureHandlerRef.current = null
      }
      measureActiveRef.current = false
      setMeasureActive(false)
      setMeasureRunning(null)
      setMeasureResult({ mode: 'point', distance: 0, area: 0, points: 1, point })
      return
    }

    if (pts.length < 2) { cancelMeasure(); return }

    const segments = computeSegmentDistances(pts)
    const lineDistance = computePolylineDistance(pts)

    if (mode === 'area') {
      const closingSeg = Cartesian3.distance(pts[pts.length - 1], pts[0])
      const perimeter = lineDistance + closingSeg
      const area = pts.length >= 3 ? computePolygonArea(pts) : 0

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

      if (measureHandlerRef.current) {
        measureHandlerRef.current.destroy()
        measureHandlerRef.current = null
      }
      measureActiveRef.current = false
      setMeasureActive(false)
      setMeasureRunning(null)
      setMeasureResult({ mode: 'area', distance: perimeter, area, points: pts.length })
      return
    }

    // line mode — open polyline, no closing edge
    if (measureLineRef.current) {
      viewer.entities.remove(measureLineRef.current)
      measureLineRef.current = null
    }
    const staticLine = viewer.entities.add({
      polyline: {
        positions: pts,
        width: 3,
        material: Color.fromCssColorString('#6366f1'),
        clampToGround: true,
      },
    })
    measureEntitiesRef.current.push(staticLine)

    if (measureHandlerRef.current) {
      measureHandlerRef.current.destroy()
      measureHandlerRef.current = null
    }
    measureActiveRef.current = false
    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult({
      mode: 'line',
      distance: lineDistance,
      area: 0,
      points: pts.length,
      segments: segments.length > 1 ? segments : undefined,
    })
  }, [cancelMeasure, viewerRef])

  const startMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    cleanupMeasure()
    setMeasureResult(null)
    setMeasureActive(true)
    measureActiveRef.current = true
    measurePointsRef.current = []
    measureCursorRef.current = null
    setMeasureRunning(null)

    const mode = measureModeRef.current

    if (mode === 'point') {
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
      measureHandlerRef.current = handler
      handler.setInputAction((click: { position: Cartesian2 }) => {
        if (!measureActiveRef.current) return
        const ray = viewer.camera.getPickRay(click.position)
        if (!ray) return
        const pos = viewer.scene.globe.pick(ray, viewer.scene)
        if (!pos) return
        measurePointsRef.current.push(pos)
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
        finishMeasure()
      }, ScreenSpaceEventType.LEFT_CLICK)
      return
    }

    // line / area — dynamic polyline that follows the cursor (area
    // additionally renders a tentative closing edge back to the start)
    measureLineRef.current = viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => {
          const pts = [...measurePointsRef.current]
          if (measureCursorRef.current && pts.length > 0) pts.push(measureCursorRef.current)
          if (measureModeRef.current === 'area' && pts.length >= 3) pts.push(pts[0])
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

      // Running readout: line shows path length; area shows running
      // perimeter (closes the current ring back to the start so users
      // see the value they'll commit on finish).
      const pts = measurePointsRef.current
      let running = computePolylineDistance(pts)
      if (measureModeRef.current === 'area' && pts.length >= 3) {
        running += Cartesian3.distance(pts[pts.length - 1], pts[0])
      }
      setMeasureRunning({ distance: running, points: pts.length })
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
      // Double-click also fires LEFT_CLICK first, so the last point is
      // a duplicate of the previous click — strip it before finishing.
      if (measurePointsRef.current.length > 1) {
        measurePointsRef.current.pop()
        const lastPt = measureEntitiesRef.current.pop()
        if (lastPt) viewer.entities.remove(lastPt)
      }
      finishMeasure()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  }, [cleanupMeasure, finishMeasure, viewerRef])

  // Switching mode mid-measure cancels in-progress work and clears any
  // displayed result so the user starts fresh in the new mode.
  const setMeasureMode = useCallback((mode: MeasureMode) => {
    if (mode === measureModeRef.current && !measureActiveRef.current && measureResult === null) {
      return
    }
    cleanupMeasure()
    measureModeRef.current = mode
    _setMeasureMode(mode)
    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult(null)
  }, [cleanupMeasure, measureResult])

  // ESC cancels; Enter finishes the current line/area measurement.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!measureActiveRef.current) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        cancelMeasure()
      } else if (e.key === 'Enter' && measureModeRef.current !== 'point') {
        finishMeasure()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelMeasure, finishMeasure])

  return {
    measureMode,
    setMeasureMode,
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
