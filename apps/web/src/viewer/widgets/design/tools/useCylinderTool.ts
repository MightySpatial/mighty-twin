/**
 * MightyTwin — Cylinder Solid Tool
 * Single-click to place a cylinder on the globe.
 * Supports solid and hollow (tube) rendering via wallThickness.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature, CylDraft } from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  cartesianToDegrees,
  addCylinderEntity,
} from './drawUtils'

const DEFAULT_CYL: Omit<CylDraft, 'lon' | 'lat' | 'alt'> = {
  radius: 3,
  height: 5,
  heading: 0,
  pitch: 0,
  roll: 0,
  wallThickness: 0,
}

interface UseCylinderToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function useCylinderTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UseCylinderToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const featureCountRef = useRef(0)

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
  }, [])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'cylinder') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      const [lon, lat, alt] = cartesianToDegrees(pos)
      const draft: CylDraft = { lon, lat, alt, ...DEFAULT_CYL }
      const { radius, height, heading, pitch, roll, wallThickness } = draft
      const headingRad = CesiumMath.toRadians(heading)
      const pitchRad = CesiumMath.toRadians(pitch)
      const rollRad = CesiumMath.toRadians(roll)
      const isHollow = wallThickness > 0 && wallThickness < radius

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const entityId = `design_cyl_${fid}`
      const style = styleFromLayerColour(layerColour)
      const fillCol = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.65)
      const outlineCol = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)

      const center = Cartesian3.fromDegrees(lon, lat, alt + height / 2)

      // Outer cylinder
      addCylinderEntity(viewer, entityId, center, headingRad, pitchRad, rollRad, radius, height, fillCol, outlineCol)

      // Inner hollow cylinder (tube outline)
      if (isHollow) {
        const innerRadius = Math.max(0.01, radius - wallThickness)
        const innerId = entityId + '__cyl_inner'
        const innerOutline = outlineCol.withAlpha(0.4)
        viewer.entities.add({
          id: innerId,
          position: center,
          cylinder: {
            length: height,
            topRadius: innerRadius,
            bottomRadius: innerRadius,
            fill: false,
            outline: true,
            outlineColor: innerOutline,
            numberOfVerticalLines: 24,
          },
        })
      }

      const feature: SketchFeature = {
        id: fid,
        label: `Cylinder ${featureCountRef.current}`,
        geometry: 'cylinder',
        layerId: activeLayerId,
        entityId,
        style,
        elevationConfig,
        attributes: { ...draft },
        createdAt: Date.now(),
      }
      onFeatureAdded(feature)
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanup
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup])
}
