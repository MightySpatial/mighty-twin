import { useEffect, useState } from 'react'
import { Math as CesiumMath } from 'cesium'
import { useViewerRef } from '../CesiumProvider'

export interface CameraSnapshot {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
}

/**
 * React hook that returns the current camera position and orientation,
 * updated each time the camera stops moving.
 *
 * For a continuous stream, subscribe to `viewer.camera.changed` directly.
 */
export function useCameraState(): CameraSnapshot | null {
  const viewerRef = useViewerRef()
  const [snapshot, setSnapshot] = useState<CameraSnapshot | null>(null)

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const capture = () => {
      const { camera } = viewer
      const carto = camera.positionCartographic
      setSnapshot({
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
        heading: CesiumMath.toDegrees(camera.heading),
        pitch: CesiumMath.toDegrees(camera.pitch),
        roll: CesiumMath.toDegrees(camera.roll),
      })
    }

    capture()
    const remove = viewer.camera.moveEnd.addEventListener(capture)
    return () => {
      remove()
    }
  }, [viewerRef])

  return snapshot
}
