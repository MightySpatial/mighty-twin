/**
 * MightyTwin — Circle Draw Tool
 * Click center, move to set radius, click again to place.
 * Uses Cesium ellipse entity.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  CallbackProperty,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature } from '../types'
import { pickPosition, makeFeatureId, styleFromLayerColour, heightReferenceForDatum } from './drawUtils'

const PREVIEW_ID = '__circle_preview__'

interface UseCircleToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function useCircleTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UseCircleToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const centerRef = useRef<Cartesian3 | null>(null)
  const radiusRef = useRef(0)
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
    centerRef.current = null
    radiusRef.current = 0
    lastClickPosRef.current = null
    lastClickTimeRef.current = 0
  }, [removePreview])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'circle') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    const previewFill = Color.fromCssColorString(layerColour).withAlpha(0.15)
    const previewStroke = Color.fromCssColorString(layerColour).withAlpha(0.5)
    const isTerrain = elevationConfig.datum === 'terrain' || elevationConfig.datum === 'custom_terrain'

    // Single persistent preview entity — CallbackProperty hides it when center is null
    viewer.entities.add({
      id: PREVIEW_ID,
      show: new CallbackProperty(() => centerRef.current !== null, false) as unknown as boolean,
      position: new CallbackProperty(() => centerRef.current, false) as unknown as Cartesian3,
      ellipse: {
        semiMajorAxis: new CallbackProperty(() => radiusRef.current || 1, false),
        semiMinorAxis: new CallbackProperty(() => radiusRef.current || 1, false),
        material: previewFill,
        outline: true,
        outlineColor: previewStroke,
        outlineWidth: 2,
        ...(isTerrain
          ? { height: elevationConfig.offset, heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset) }
          : {}),
      },
    })

    handler.setInputAction((click: { position: Cartesian2 }) => {
      // Double-click guard — prevent degenerate zero-radius circle
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

      if (!centerRef.current) {
        centerRef.current = pos
        return
      }

      // Second click — commit the circle
      const radius = Cartesian3.distance(centerRef.current, pos)
      if (radius < 0.1) return

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const entityId = `design_circle_${fid}`
      const style = styleFromLayerColour(layerColour)
      const stroke = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)
      const fill = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.5)
      const center = centerRef.current

      viewer.entities.add({
        id: entityId,
        position: center,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: fill,
          outline: true,
          outlineColor: stroke,
          outlineWidth: style.lineWidth,
          ...(isTerrain
            ? { height: elevationConfig.offset, heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset) }
            : {}),
        },
      })

      const feature: SketchFeature = {
        id: fid,
        label: `Circle ${featureCountRef.current}`,
        geometry: 'circle',
        layerId: activeLayerId,
        entityId,
        style,
        elevationConfig,
        attributes: {},
        createdAt: Date.now(),
      }
      onFeatureAdded(feature)

      // Reset for next circle — preview CallbackProperty auto-hides
      centerRef.current = null
      radiusRef.current = 0
      lastClickPosRef.current = null
      lastClickTimeRef.current = 0
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      if (!centerRef.current) return
      const pos = pickPosition(viewer, move.endPosition, elevationConfig)
      if (pos) radiusRef.current = Cartesian3.distance(centerRef.current, pos)
    }, ScreenSpaceEventType.MOUSE_MOVE)

    return cleanup
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup])
}
