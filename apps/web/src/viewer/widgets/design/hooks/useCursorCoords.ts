/** Track the cursor's globe position for the status bar. Subscribes to
 *  Cesium MOUSE_MOVE; returns null when the cursor is off-globe. */
import { useEffect, useState } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium'

export interface CursorCoord {
  lon: number
  lat: number
  alt: number
}

export function useCursorCoords(viewer: CesiumViewerType | null): CursorCoord | null {
  const [coord, setCoord] = useState<CursorCoord | null>(null)

  useEffect(() => {
    if (!viewer) return
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((evt: { endPosition: Cartesian2 }) => {
      const ray = viewer.camera.getPickRay(evt.endPosition)
      const hit = ray
        ? viewer.scene.globe.pick(ray, viewer.scene)
          ?? viewer.camera.pickEllipsoid(evt.endPosition, viewer.scene.globe.ellipsoid)
        : null
      if (!hit) {
        setCoord(null)
        return
      }
      const carto = Cartographic.fromCartesian(hit)
      setCoord({
        lon: CesiumMath.toDegrees(carto.longitude),
        lat: CesiumMath.toDegrees(carto.latitude),
        alt: carto.height,
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)
    return () => handler.destroy()
  }, [viewer])

  return coord
}
