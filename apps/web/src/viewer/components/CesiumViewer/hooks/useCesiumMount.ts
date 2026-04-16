import { useRef, useEffect } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Terrain,
  HeadingPitchRange,
  Math as CesiumMath,
  BoundingSphere,
  Matrix4,
} from 'cesium'
import type { CameraPosition } from '../types'

export function useCesiumMount(
  tokenReady: boolean,
  initialPosition: CameraPosition,
  onViewerReady?: (viewer: CesiumViewerType) => void,
  onCleanup?: () => void,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumViewerType | null>(null)
  const destroyedRef = useRef(false)

  // Mount Cesium
  useEffect(() => {
    if (!tokenReady || !containerRef.current || viewerRef.current || destroyedRef.current) return

    const viewer = new CesiumViewerType(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      infoBox: true,
      terrain: Terrain.fromWorldTerrain(),
      creditContainer: document.createElement('div'),
    })

    viewer.scene.globe.enableLighting = false
    viewer.scene.pickTranslucentDepth = true  // needed for scene.pickPosition on globe surface
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true

    viewer.camera.lookAt(
      Cartesian3.fromDegrees(initialPosition.longitude, initialPosition.latitude, 0),
      new HeadingPitchRange(
        CesiumMath.toRadians(initialPosition.heading ?? 0),
        CesiumMath.toRadians(initialPosition.pitch ?? -45),
        initialPosition.height ?? 5000,
      )
    )
    viewer.camera.lookAtTransform(Matrix4.IDENTITY)

    viewerRef.current = viewer
    ;(window as unknown as Record<string, unknown>).__cesiumViewer = viewer
    if (onViewerReady) onViewerReady(viewer)

    return () => {
      destroyedRef.current = true
      onCleanup?.()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [tokenReady])

  // Fly to site camera when initialPosition changes after mount
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.camera.flyToBoundingSphere(
      new BoundingSphere(
        Cartesian3.fromDegrees(initialPosition.longitude, initialPosition.latitude, 0),
        0
      ),
      {
        duration: 1.5,
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(initialPosition.heading ?? 0),
          CesiumMath.toRadians(initialPosition.pitch ?? -45),
          initialPosition.height ?? 5000,
        ),
      }
    )
  }, [initialPosition.longitude, initialPosition.latitude, initialPosition.height])

  return { viewerRef, containerRef }
}
