/**
 * MightyTwin — Point Draw Tool
 * Single-click to place a point entity on the globe.
 * Uses billboard with point symbology instead of raw PointGraphics.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  VerticalOrigin,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature } from '../types'
import { pickPosition, makeFeatureId, styleFromLayerColour, heightReferenceForDatum } from './drawUtils'
import { DEFAULT_POINT_SYMBOL, pointSymbolToDataUrl } from '../../../shared/pointSymbology'
import type { PointSymbolStyle } from '../../../shared/pointSymbology'

interface UsePointToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
  layerPointSymbol?: PointSymbolStyle
}

export function usePointTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
  layerPointSymbol,
}: UsePointToolOpts) {
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
    if (!viewer || activeTool !== 'point') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      featureCountRef.current += 1
      const fid = makeFeatureId()
      const entityId = `design_point_${fid}`
      const style = styleFromLayerColour(layerColour)

      const symbol: PointSymbolStyle = layerPointSymbol
        ? { ...layerPointSymbol }
        : { ...DEFAULT_POINT_SYMBOL, fillColor: layerColour }

      const imgUrl = pointSymbolToDataUrl(symbol)
      const isPin = ['pin', 'pin-outline', 'pin-dot', 'pushpin', 'flag', 'marker', 'beacon'].includes(symbol.symbolType)

      viewer.entities.add({
        id: entityId,
        position: pos,
        billboard: {
          image: imgUrl,
          verticalOrigin: isPin ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
          heightReference: heightReferenceForDatum(elevationConfig.datum, elevationConfig.offset),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      const feature: SketchFeature = {
        id: fid,
        label: `Point ${featureCountRef.current}`,
        geometry: 'point',
        layerId: activeLayerId,
        entityId,
        style: { ...style, pointSymbol: symbol },
        elevationConfig,
        attributes: {},
        createdAt: Date.now(),
      }
      onFeatureAdded(feature)
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanup
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup, layerPointSymbol])
}
