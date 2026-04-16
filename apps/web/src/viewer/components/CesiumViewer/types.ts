import type { Viewer as CesiumViewerType } from 'cesium'
import type { LayerStyle, LayerMetadata, LayerType, CameraPosition as ApiCameraPosition, SiteData } from '../../types/api'

export type { LayerStyle as LayerSymbology }

export interface Layer {
  id: string
  name: string
  type: LayerType
  url?: string
  visible: boolean
  opacity?: number
  order?: number
  style?: LayerStyle
  layer_metadata?: LayerMetadata
}

export type CameraPosition = ApiCameraPosition

export interface CesiumViewerProps {
  siteId?: string
  site?: SiteData | null
  initialPosition?: CameraPosition
  layers?: Layer[]
  layersLoading?: boolean
  onViewerReady?: (viewer: CesiumViewerType) => void
  onLayerToggle?: (layerId: string) => void
  onLayerOpacityChange?: (layerId: string, opacity: number) => void
}
