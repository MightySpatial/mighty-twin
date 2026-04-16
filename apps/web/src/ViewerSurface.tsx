import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { useShellContext } from '@mightyspatial/app-shell'
import { usePersistedSettings } from '@mightyspatial/settings-panels'

const ENV_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined

/** MightyTwin's viewer — defaults to flying to Forrest Airport (Space Angel
 *  demo site) at 28350 MGA2020 Zone 50 storage. All feature reads/writes go
 *  through the _wgs84 reprojection view on the API side, so this component
 *  stays CRS-agnostic. */
export function ViewerSurface() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const { paneSize } = useShellContext()
  const { settings } = usePersistedSettings()

  useEffect(() => {
    if (!containerRef.current) return

    const userToken = settings.basemap.ionToken.trim()
    const resolvedIonToken = userToken || ENV_ION_TOKEN
    if (resolvedIonToken) Cesium.Ion.defaultAccessToken = resolvedIonToken
    const hasIon = !!resolvedIonToken

    const v = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
    })

    v.imageryLayers.removeAll()
    if (hasIon) {
      Cesium.IonImageryProvider.fromAssetId(2)
        .then((p) => !v.isDestroyed() && v.imageryLayers.addImageryProvider(p))
        .catch(() => {})
      Cesium.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: true })
        .then((t) => {
          if (!v.isDestroyed()) v.terrainProvider = t
        })
        .catch(() => {})
      v.scene.globe.depthTestAgainstTerrain = true
    } else {
      v.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          credit: '© OpenStreetMap contributors',
          maximumLevel: 19,
        }),
      )
    }

    // Forrest Airport — Space Angel demo site. WGS84 because Cesium renders
    // in 4326; the FastAPI backend ST_Transforms from MGA2020 Zone 50 on the
    // way out of the _wgs84 view.
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(128.12, -30.85, 12_000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
    })

    setViewer(v)
    return () => {
      v.destroy()
      setViewer(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (viewer && !viewer.isDestroyed()) viewer.resize()
  }, [paneSize.width, paneSize.height, viewer])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
