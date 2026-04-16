/**
 * MightyTwin — Box (Cube) Solid Tool
 * Single-click to place a box on the globe.
 * Supports solid and hollow (6-panel) rendering via wallThickness.
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
import type { DesignTool, ElevationConfig, SketchFeature, BoxDraft } from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  cartesianToDegrees,
  addBoxEntity,
  enuOffsetToWorld,
} from './drawUtils'

const DEFAULT_BOX: Omit<BoxDraft, 'lon' | 'lat' | 'alt'> = {
  width: 5,
  height: 5,
  depth: 5,
  heading: 0,
  wallThickness: 0,
  shape: 'square',
}

interface UseBoxToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function useBoxTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UseBoxToolOpts) {
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
    if (!viewer || activeTool !== 'box') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      const [lon, lat, alt] = cartesianToDegrees(pos)
      const draft: BoxDraft = { lon, lat, alt, ...DEFAULT_BOX }
      const { width, depth, height, heading, wallThickness } = draft
      const headingRad = CesiumMath.toRadians(heading)
      const isHollow = wallThickness > 0 && wallThickness < Math.min(width, depth, height) / 2

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const style = styleFromLayerColour(layerColour)
      const fillCol = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.65)
      const outlineCol = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)

      if (!isHollow) {
        // Solid box — single entity
        const entityId = `design_box_${fid}`
        const center = Cartesian3.fromDegrees(lon, lat, alt + height / 2)
        addBoxEntity(viewer, entityId, center, headingRad, width, depth, height, fillCol, outlineCol)

        onFeatureAdded({
          id: fid,
          label: `Box ${featureCountRef.current}`,
          geometry: 'box',
          layerId: activeLayerId,
          entityId,
          style,
          elevationConfig,
          attributes: { ...draft },
          createdAt: Date.now(),
        })
      } else {
        // Hollow box — 6 panels (N S E W Top Bottom)
        const baseEntityId = `design_box_${fid}`
        const baseCart = Cartesian3.fromDegrees(lon, lat, alt)
        const t = wallThickness
        const hw = width / 2
        const hd = depth / 2
        const hh = height / 2
        const innerD = Math.max(0.01, depth - t * 2)
        const innerH = Math.max(0.01, height - t * 2)

        const panels: [string, number, number, number, number, number, number][] = [
          ['_n', 0, hd - t / 2, hh, width, t, innerH],
          ['_s', 0, -(hd - t / 2), hh, width, t, innerH],
          ['_e', hw - t / 2, 0, hh, t, innerD, innerH],
          ['_w', -(hw - t / 2), 0, hh, t, innerD, innerH],
          ['_top', 0, 0, height - t / 2, width, depth, t],
          ['_bot', 0, 0, t / 2, width, depth, t],
        ]

        for (const [suffix, e, n, u, bw, bd, bh] of panels) {
          const center = enuOffsetToWorld(baseCart, headingRad, e, n, u)
          addBoxEntity(viewer, baseEntityId + suffix, center, headingRad, bw, bd, bh, fillCol, outlineCol)
        }

        onFeatureAdded({
          id: fid,
          label: `Box ${featureCountRef.current}`,
          geometry: 'box',
          layerId: activeLayerId,
          entityId: baseEntityId,
          style,
          elevationConfig,
          attributes: { ...draft },
          createdAt: Date.now(),
        })
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanup
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup])
}
