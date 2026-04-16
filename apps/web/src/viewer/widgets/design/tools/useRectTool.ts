/**
 * MightyTwin — Rectangle Draw Tool
 * Click first corner, move to preview, click second corner to place.
 * Generates a 4-vertex polygon entity.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  CallbackProperty,
  PolygonHierarchy,
  Math as CesiumMath,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature } from '../types'
import { pickPosition, makeFeatureId, styleFromLayerColour, heightReferenceForDatum } from './drawUtils'

const PREVIEW_ID = '__rect_preview__'

interface UseRectToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

/** Build 4 corners from two opposite corners in geographic space, preserving height from first corner. */
function rectCorners(c1: Cartesian3, c2: Cartesian3): Cartesian3[] {
  const carto1 = Cartographic.fromCartesian(c1)
  const carto2 = Cartographic.fromCartesian(c2)
  const lon1 = CesiumMath.toDegrees(carto1.longitude)
  const lat1 = CesiumMath.toDegrees(carto1.latitude)
  const lon2 = CesiumMath.toDegrees(carto2.longitude)
  const lat2 = CesiumMath.toDegrees(carto2.latitude)
  const h = carto1.height

  return [
    Cartesian3.fromDegrees(lon1, lat1, h),
    Cartesian3.fromDegrees(lon2, lat1, h),
    Cartesian3.fromDegrees(lon2, lat2, h),
    Cartesian3.fromDegrees(lon1, lat2, h),
  ]
}

export function useRectTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UseRectToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const corner1Ref = useRef<Cartesian3 | null>(null)
  const cursorRef = useRef<Cartesian3 | null>(null)
  const featureCountRef = useRef(0)
  const lastClickPosRef = useRef<Cartesian2 | null>(null)
  const lastClickTimeRef = useRef<number>(0)

  const removePreview = useCallback(() => {
    if (!viewer) return
    const existing = viewer.entities.getById(PREVIEW_ID)
    if (existing) viewer.entities.remove(existing)
  }, [viewer])

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    removePreview()
    corner1Ref.current = null
    cursorRef.current = null
    lastClickPosRef.current = null
    lastClickTimeRef.current = 0
  }, [removePreview])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'rectangle') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    const previewFill = Color.fromCssColorString(layerColour).withAlpha(0.15)
    const previewStroke = Color.fromCssColorString(layerColour).withAlpha(0.5)

    // Preview entity stays alive for the entire tool session; CallbackProperty
    // returns empty hierarchy when refs are null (no rectangle to show yet).
    const isTerrain = elevationConfig.datum === 'terrain' || elevationConfig.datum === 'custom_terrain'
    viewer.entities.add({
      id: PREVIEW_ID,
      polygon: {
        hierarchy: new CallbackProperty(() => {
          if (!corner1Ref.current || !cursorRef.current) return new PolygonHierarchy([])
          return new PolygonHierarchy(rectCorners(corner1Ref.current, cursorRef.current))
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

    handler.setInputAction((click: { position: Cartesian2 }) => {
      // Double-click guard — prevent degenerate zero-area rectangle
      const now = Date.now()
      if (
        lastClickTimeRef.current &&
        now - lastClickTimeRef.current < 300 &&
        lastClickPosRef.current &&
        Cartesian2.distance(click.position, lastClickPosRef.current) < 5
      ) {
        return
      }
      lastClickPosRef.current = Cartesian2.clone(click.position)
      lastClickTimeRef.current = now

      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      if (!corner1Ref.current) {
        corner1Ref.current = pos
        return
      }

      // Second click — commit the rectangle
      const corners = rectCorners(corner1Ref.current, pos)
      // Reject degenerate rectangles (near-zero area)
      const dx = Cartesian3.distance(corners[0], corners[1])
      const dy = Cartesian3.distance(corners[1], corners[2])
      if (dx < 0.1 || dy < 0.1) return

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const entityId = `design_rect_${fid}`
      const style = styleFromLayerColour(layerColour)
      const stroke = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)
      const fill = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.5)
      viewer.entities.add({
        id: entityId,
        polygon: {
          hierarchy: new PolygonHierarchy(corners),
          material: fill,
          outline: true,
          outlineColor: stroke,
          outlineWidth: style.lineWidth,
          ...(isTerrain
            ? { height: elevationConfig.offset, heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset) }
            : { perPositionHeight: true }),
        },
      })

      const feature: SketchFeature = {
        id: fid,
        label: `Rectangle ${featureCountRef.current}`,
        geometry: 'rectangle',
        layerId: activeLayerId,
        entityId,
        style,
        elevationConfig,
        attributes: {},
        createdAt: Date.now(),
      }
      onFeatureAdded(feature)

      // Reset for next rectangle — preview CallbackProperty auto-hides
      corner1Ref.current = null
      cursorRef.current = null
      lastClickPosRef.current = null
      lastClickTimeRef.current = 0
    }, ScreenSpaceEventType.LEFT_CLICK)

    // Suppress Cesium's default double-click zoom while drawing
    handler.setInputAction(() => {}, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      if (!corner1Ref.current) return
      const pos = pickPosition(viewer, move.endPosition, elevationConfig)
      cursorRef.current = pos
    }, ScreenSpaceEventType.MOUSE_MOVE)

    return cleanup
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup])
}
