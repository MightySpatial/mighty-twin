import { useRef, useState, useEffect } from 'react'
import {
  Viewer as CesiumViewerType,
  Color,
  Entity,
  Rectangle,
} from 'cesium'

export function useGlobeTransparency(viewerRef: React.RefObject<CesiumViewerType | null>) {
  const [globeAlpha, setGlobeAlpha] = useState(100)
  const [transparencyOpen, setTransparencyOpen] = useState(false)
  const falseFloorRef = useRef<Entity | null>(null)

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const alpha = globeAlpha / 100
    const isTransparent = alpha < 1

    viewer.scene.globe.translucency.enabled = isTransparent
    if (isTransparent) {
      viewer.scene.globe.translucency.frontFaceAlpha = alpha
    }
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = !isTransparent

    // False floor entity
    if (isTransparent) {
      if (!falseFloorRef.current) {
        falseFloorRef.current = viewer.entities.add({
          rectangle: {
            coordinates: Rectangle.fromDegrees(-180, -90, 180, 90),
            height: -200,
            material: Color.fromCssColorString('#0a0a0f').withAlpha(0.7),
          },
        })
      }
    } else {
      if (falseFloorRef.current) {
        viewer.entities.remove(falseFloorRef.current)
        falseFloorRef.current = null
      }
    }
  }, [globeAlpha, viewerRef])

  return { globeAlpha, setGlobeAlpha, transparencyOpen, setTransparencyOpen }
}
