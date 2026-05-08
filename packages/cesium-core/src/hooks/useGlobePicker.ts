import { useCallback } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
} from 'cesium'
import { useViewerRef } from '../CesiumProvider'

export interface GlobePickResult {
  /** Cesium Cartesian3 position on the globe surface. */
  position: Cartesian3
  /** Longitude in degrees. */
  longitude: number
  /** Latitude in degrees. */
  latitude: number
  /** Height above ellipsoid in metres (not terrain height). */
  height: number
}

/**
 * Returns a stable function that converts a screen position (from a Cesium
 * pointer event) into a globe surface position, or null if the pointer was
 * over empty space.
 */
export function useGlobePicker() {
  const viewerRef = useViewerRef()

  return useCallback(
    (screen: Cartesian2): GlobePickResult | null => {
      const viewer = viewerRef.current
      if (!viewer) return null

      const ray = viewer.camera.getPickRay(screen)
      if (!ray) return null

      const position = viewer.scene.globe.pick(ray, viewer.scene)
      if (!position) return null

      const carto = Cartographic.fromCartesian(position)
      return {
        position,
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
      }
    },
    [viewerRef],
  )
}
