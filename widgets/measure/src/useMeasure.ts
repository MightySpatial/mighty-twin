import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HeightReference,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium'
import { useViewerRef } from '@mightyspatial/cesium-core'
import { computePolygonArea, computePolylineDistance } from './measureUtils'
import type { MeasureResult, MeasureRunning } from './types'

const LINE_COLOR = '#6366f1'
const FILL_COLOR = '#6366f1'

/**
 * Cesium-interaction lifecycle for Measure. Reads the viewer from
 * `@mightyspatial/cesium-core` context; widget components consume this hook
 * directly, no ref prop needed.
 */
export function useMeasure() {
  const viewerRef = useViewerRef()

  const [measureActive, setMeasureActive] = useState(false)
  const [measureRunning, setMeasureRunning] = useState<MeasureRunning | null>(null)
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null)

  const pointsRef = useRef<Cartesian3[]>([])
  const cursorRef = useRef<Cartesian3 | null>(null)
  const entitiesRef = useRef<Entity[]>([])
  const lineRef = useRef<Entity | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const activeFlagRef = useRef(false)

  const cleanup = useCallback(() => {
    const viewer = viewerRef.current
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    if (viewer) {
      entitiesRef.current.forEach((e) => viewer.entities.remove(e))
      if (lineRef.current) viewer.entities.remove(lineRef.current)
    }
    entitiesRef.current = []
    lineRef.current = null
    pointsRef.current = []
    cursorRef.current = null
    activeFlagRef.current = false
  }, [viewerRef])

  const cancelMeasure = useCallback(() => {
    cleanup()
    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult(null)
  }, [cleanup])

  const clearResult = useCallback(() => {
    cleanup()
    setMeasureResult(null)
  }, [cleanup])

  const finishMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const pts = pointsRef.current
    if (pts.length < 2) {
      cancelMeasure()
      return
    }

    const distance = computePolylineDistance(pts)
    const area = pts.length >= 3 ? computePolygonArea(pts) : 0

    // Closing polygon fill for 3+ points
    if (pts.length >= 3) {
      const polygon = viewer.entities.add({
        polygon: {
          hierarchy: new PolygonHierarchy(pts),
          material: Color.fromCssColorString(FILL_COLOR).withAlpha(0.15),
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
      entitiesRef.current.push(polygon)
    }

    // Swap dynamic line for a static, closed one
    if (lineRef.current) {
      viewer.entities.remove(lineRef.current)
      lineRef.current = null
    }
    const staticLine = viewer.entities.add({
      polyline: {
        positions: pts.length >= 3 ? [...pts, pts[0]!] : pts,
        width: 3,
        material: Color.fromCssColorString(LINE_COLOR),
        clampToGround: true,
      },
    })
    entitiesRef.current.push(staticLine)

    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    activeFlagRef.current = false

    setMeasureActive(false)
    setMeasureRunning(null)
    setMeasureResult({ distance, area, points: pts.length })
  }, [cancelMeasure, viewerRef])

  const startMeasure = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (activeFlagRef.current) {
      cancelMeasure()
      return
    }

    cleanup()
    setMeasureResult(null)

    setMeasureActive(true)
    activeFlagRef.current = true
    pointsRef.current = []
    cursorRef.current = null

    // Dynamic polyline that follows the cursor
    lineRef.current = viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => {
          const pts = [...pointsRef.current]
          if (cursorRef.current && pts.length > 0) pts.push(cursorRef.current)
          return pts
        }, false),
        width: 3,
        material: Color.fromCssColorString(LINE_COLOR).withAlpha(0.8),
        clampToGround: true,
      },
    })

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      if (!activeFlagRef.current) return
      const ray = viewer.camera.getPickRay(click.position)
      if (!ray) return
      const pos = viewer.scene.globe.pick(ray, viewer.scene)
      if (!pos) return

      pointsRef.current.push(pos)

      const dot = viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString(LINE_COLOR),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      })
      entitiesRef.current.push(dot)

      const d = computePolylineDistance(pointsRef.current)
      setMeasureRunning({ distance: d, points: pointsRef.current.length })
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!activeFlagRef.current) return
      const ray = viewer.camera.getPickRay(movement.endPosition)
      if (!ray) return
      const pos = viewer.scene.globe.pick(ray, viewer.scene)
      if (pos) cursorRef.current = pos
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction(() => {
      if (!activeFlagRef.current) return
      // Left-double-click also fires LEFT_CLICK first, which adds a duplicate
      // point; drop it before finishing.
      if (pointsRef.current.length > 1) {
        pointsRef.current.pop()
        const last = entitiesRef.current.pop()
        if (last) viewer.entities.remove(last)
      }
      finishMeasure()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  }, [cancelMeasure, cleanup, finishMeasure, viewerRef])

  // ESC cancels an active measurement
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeFlagRef.current) cancelMeasure()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelMeasure])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    measureActive,
    measureRunning,
    measureResult,
    startMeasure,
    cancelMeasure,
    clearResult,
  }
}
