/**
 * MightyTwin — Polygon Draw Tool
 * Click to add vertices. Double-click or Enter to close and finish (min 3 vertices).
 * Shows a live preview polygon while drawing.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  CallbackProperty,
  PolygonHierarchy,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature } from '../types'
import { pickPosition, makeFeatureId, styleFromLayerColour, heightReferenceForDatum, clampToGroundForDatum } from './drawUtils'

const PREVIEW_POLY_ID = '__polygon_preview__'
const PREVIEW_LINE_ID = '__polygon_preview_outline__'

interface UsePolygonToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function usePolygonTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UsePolygonToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const positionsRef = useRef<Cartesian3[]>([])
  const cursorRef = useRef<Cartesian3 | null>(null)
  const featureCountRef = useRef(0)
  const lastClickPosRef = useRef<Cartesian2 | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const [vertexCount, setVertexCount] = useState(0)

  const removePreview = useCallback(() => {
    if (!viewer) return
    const poly = viewer.entities.getById(PREVIEW_POLY_ID)
    if (poly) viewer.entities.remove(poly)
    const line = viewer.entities.getById(PREVIEW_LINE_ID)
    if (line) viewer.entities.remove(line)
  }, [viewer])

  const completePolygon = useCallback(() => {
    if (!viewer || positionsRef.current.length < 3) return

    // Defensive: drop trailing vertex if it duplicates the previous one
    // (can happen when the timing-based double-click guard misses)
    const pts = positionsRef.current
    if (pts.length >= 2) {
      const last = pts[pts.length - 1]
      const prev = pts[pts.length - 2]
      if (Cartesian3.equalsEpsilon(last, prev, 0, 0.5)) {
        pts.pop()
      }
    }
    if (pts.length < 3) return

    featureCountRef.current += 1
    const fid = makeFeatureId()
    const entityId = `design_polygon_${fid}`
    const style = styleFromLayerColour(layerColour)
    const stroke = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)
    const fill = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.5)
    const positions = [...positionsRef.current]

    removePreview()

    const isTerrain = elevationConfig.datum === 'terrain' || elevationConfig.datum === 'custom_terrain'
    viewer.entities.add({
      id: entityId,
      polygon: {
        hierarchy: new PolygonHierarchy(positions),
        material: fill,
        outline: true,
        outlineColor: stroke,
        outlineWidth: style.lineWidth,
        // Terrain-clamped polygons use height=0 (ground level); absolute datums use perPositionHeight
        ...(isTerrain
          ? { height: elevationConfig.offset, heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset) }
          : { perPositionHeight: true }),
      },
    })

    const feature: SketchFeature = {
      id: fid,
      label: `Polygon ${featureCountRef.current}`,
      geometry: 'polygon',
      layerId: activeLayerId,
      entityId,
      style,
      elevationConfig,
      attributes: {},
      createdAt: Date.now(),
    }
    onFeatureAdded(feature)
    positionsRef.current = []
    cursorRef.current = null
    setVertexCount(0)
  }, [viewer, layerColour, elevationConfig, activeLayerId, onFeatureAdded, removePreview])

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    removePreview()
    positionsRef.current = []
    cursorRef.current = null
    lastClickPosRef.current = null
    lastClickTimeRef.current = 0
    setVertexCount(0)
  }, [removePreview])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'polygon') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    // Live preview — polygon fill + polyline outline (closing edge)
    const previewStroke = Color.fromCssColorString(layerColour).withAlpha(0.5)
    const previewFill = Color.fromCssColorString(layerColour).withAlpha(0.15)

    const isTerrain = elevationConfig.datum === 'terrain' || elevationConfig.datum === 'custom_terrain'
    viewer.entities.add({
      id: PREVIEW_POLY_ID,
      polygon: {
        hierarchy: new CallbackProperty(() => {
          const pts = [...positionsRef.current]
          if (cursorRef.current) pts.push(cursorRef.current)
          return pts.length >= 3 ? new PolygonHierarchy(pts) : new PolygonHierarchy([])
        }, false),
        material: previewFill,
        outline: true,
        outlineColor: previewStroke,
        outlineWidth: 2,
        ...(isTerrain
          ? { height: elevationConfig.offset, heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset) }
          : { perPositionHeight: true }),
      },
    })

    // Polyline preview — shows edges including closing edge back to first vertex
    viewer.entities.add({
      id: PREVIEW_LINE_ID,
      polyline: {
        positions: new CallbackProperty(() => {
          const pts = [...positionsRef.current]
          if (cursorRef.current) pts.push(cursorRef.current)
          // Close the ring back to first vertex when we have 2+ points
          if (pts.length >= 2) pts.push(pts[0])
          return pts.length >= 2 ? pts : []
        }, false),
        width: 2,
        material: previewStroke,
        clampToGround: clampToGroundForDatum(elevationConfig.datum),
      },
    })

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const now = Date.now()
      if (
        lastClickTimeRef.current &&
        now - lastClickTimeRef.current < 500 &&
        lastClickPosRef.current &&
        Cartesian2.distance(click.position, lastClickPosRef.current) < 8
      ) {
        // Second click of a double-click — skip to prevent duplicate vertex
        return
      }
      lastClickPosRef.current = Cartesian2.clone(click.position)
      lastClickTimeRef.current = now

      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (pos) {
        positionsRef.current.push(pos)
        setVertexCount(positionsRef.current.length)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const pos = pickPosition(viewer, move.endPosition, elevationConfig)
      cursorRef.current = pos
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction(() => {
      completePolygon()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') completePolygon()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cleanup()
    }
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup, completePolygon])

  return { vertexCount }
}
