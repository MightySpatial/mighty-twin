import { useState, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ImageryLayer,
  IonImageryProvider,
  OpenStreetMapImageryProvider,
} from 'cesium'

export function useBasemap(
  viewerRef: React.RefObject<CesiumViewerType | null>,
  imgMapRef: React.RefObject<Map<string, ImageryLayer>>,
) {
  const [activeBasemap, setActiveBasemap] = useState('bing-aerial')
  const [basemapOpen, setBasemapOpen] = useState(false)

  const switchBasemap = useCallback(async (id: string) => {
    const viewer = viewerRef.current
    if (!viewer) return
    setActiveBasemap(id)
    setBasemapOpen(false)

    // Base layer is always index 0
    while (viewer.imageryLayers.length > 0) {
      const last = viewer.imageryLayers.get(viewer.imageryLayers.length - 1)
      const isDataLayer = imgMapRef.current?.has(
        [...(imgMapRef.current?.entries() ?? [])].find(([, v]) => v === last)?.[0] ?? ''
      )
      if (isDataLayer) break
      viewer.imageryLayers.remove(last)
    }

    let provider
    switch (id) {
      case 'bing-aerial':
        provider = await IonImageryProvider.fromAssetId(2)
        break
      case 'bing-hybrid':
        provider = await IonImageryProvider.fromAssetId(3)
        break
      case 'bing-road':
        provider = await IonImageryProvider.fromAssetId(4)
        break
      case 'osm':
        provider = new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        })
        break
      default:
        provider = await IonImageryProvider.fromAssetId(2)
    }
    viewer.imageryLayers.addImageryProvider(provider, 0)
  }, [viewerRef, imgMapRef])

  return { activeBasemap, basemapOpen, setBasemapOpen, switchBasemap }
}
