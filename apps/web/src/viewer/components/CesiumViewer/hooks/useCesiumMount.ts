import { useRef, useEffect } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  BoundingSphere,
  Matrix4,
} from 'cesium'
import type { CameraPosition } from '../types'
import { getBasemapFallbackOptions } from '../../../shared/basemapFallback'

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

    // Basemap attribution lives in the default credit container Cesium
    // creates inside the viewer host (.cesium-widget-credits). Previously
    // we passed an orphan ``document.createElement('div')`` which
    // detached the container from the DOM entirely — fine for the
    // dev "no chrome" look, broken for Mapbox / OSM / Esri TOS which
    // require visible attribution. Letting Cesium own the container
    // (and the CSS in CesiumViewer.css already hides the Cesium logo
    // + "Data attribution" expand link) gives us the right balance:
    // a small inline credit band, no Cesium branding.
    const fallback = getBasemapFallbackOptions()
    const viewer = new CesiumViewerType(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      infoBox: false,
      // Bing Aerial (Ion default) needs a Cesium Ion token; without one
      // the globe stays black. `getBasemapFallbackOptions()` swaps in
      // OSM + the default ellipsoid when no token is configured.
      baseLayer: fallback.baseLayer,
      terrain: fallback.terrain,
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
      // Stop Cesium's render loop before destroy so in-flight postRender
      // callbacks don't fire after the widget is gone (avoids
      // "this._cesiumWidget.scene is undefined" crashes on tab switch).
      try { viewer.useDefaultRenderLoop = false } catch { /* already gone */ }
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
