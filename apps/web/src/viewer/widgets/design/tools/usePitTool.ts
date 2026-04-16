/**
 * MightyTwin — Pit (Open-Top Container) Solid Tool
 * Single-click to place a pit on the globe.
 * Supports square (4 walls + floor) and round (cylinders) shapes.
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
import type { DesignTool, ElevationConfig, SketchFeature, PitDraft } from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  cartesianToDegrees,
  addBoxEntity,
  addCylinderEntity,
  enuOffsetToWorld,
} from './drawUtils'

const DEFAULT_PIT: Omit<PitDraft, 'lon' | 'lat' | 'alt'> = {
  width: 3,
  depth: 3,
  height: 3,
  heading: 0,
  wallThickness: 0.5,
  floorThickness: 0.3,
  shape: 'square',
  radius: 1.5,
}

interface UsePitToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function usePitTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UsePitToolOpts) {
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
    if (!viewer || activeTool !== 'pit') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      const [lon, lat, alt] = cartesianToDegrees(pos)
      const draft: PitDraft = { lon, lat, alt, ...DEFAULT_PIT }
      const { width, depth, height, heading, wallThickness, floorThickness, shape, radius } = draft
      const headingRad = CesiumMath.toRadians(heading)

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const baseEntityId = `design_pit_${fid}`
      const style = styleFromLayerColour(layerColour)
      const fillCol = Color.fromCssColorString(style.fillColor).withAlpha(0.85)
      const outlineCol = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)

      const baseCart = Cartesian3.fromDegrees(lon, lat, alt)

      if (shape === 'round') {
        // Round pit — floor disk + outer wall cylinder + inner cylinder outline
        const wallH = Math.max(0.01, height - floorThickness)

        // Floor disk
        const floorCenter = Cartesian3.fromDegrees(lon, lat, alt + floorThickness / 2)
        addCylinderEntity(viewer, baseEntityId + '_rf', floorCenter, headingRad, 0, 0, radius, floorThickness, fillCol, outlineCol)

        // Outer wall
        const wallCenter = Cartesian3.fromDegrees(lon, lat, alt + floorThickness + wallH / 2)
        const wallFill = Color.fromCssColorString(style.fillColor).withAlpha(0.7)
        addCylinderEntity(viewer, baseEntityId + '_rwo', wallCenter, headingRad, 0, 0, radius, wallH, wallFill, outlineCol)

        // Inner cylinder outline
        const innerRadius = Math.max(0.01, radius - wallThickness)
        const innerOutline = outlineCol.withAlpha(0.5)
        const innerId = baseEntityId + '_rwi'
        viewer.entities.add({
          id: innerId,
          position: wallCenter,
          cylinder: {
            length: wallH,
            topRadius: innerRadius,
            bottomRadius: innerRadius,
            fill: false,
            outline: true,
            outlineColor: innerOutline,
            numberOfVerticalLines: 24,
          },
        })
      } else {
        // Square pit — 4 walls + floor
        const wallH = Math.max(0.01, height - floorThickness)
        const wallCenterUp = floorThickness + wallH / 2
        const t = wallThickness
        const hw = width / 2
        const hd = depth / 2

        const walls: [string, number, number, number, number][] = [
          ['_n', 0, hd - t / 2, width, t],
          ['_s', 0, -(hd - t / 2), width, t],
          ['_e', hw - t / 2, 0, t, depth - t * 2],
          ['_w', -(hw - t / 2), 0, t, depth - t * 2],
        ]

        for (const [suffix, eOff, nOff, bw, bd] of walls) {
          const center = enuOffsetToWorld(baseCart, headingRad, eOff, nOff, wallCenterUp)
          addBoxEntity(viewer, baseEntityId + suffix, center, headingRad, bw, bd, wallH, fillCol, outlineCol)
        }

        // Floor
        const floorCenter = enuOffsetToWorld(baseCart, headingRad, 0, 0, floorThickness / 2)
        addBoxEntity(viewer, baseEntityId + '_f', floorCenter, headingRad, width, depth, floorThickness, fillCol, outlineCol)
      }

      const feature: SketchFeature = {
        id: fid,
        label: `Pit ${featureCountRef.current}`,
        geometry: 'pit',
        layerId: activeLayerId,
        entityId: baseEntityId,
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
