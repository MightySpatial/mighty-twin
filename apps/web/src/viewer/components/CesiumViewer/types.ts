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
  /** Called when the user activates the Story rail tile.
   *  The host owns story-map state (picker, current slide, layer
   *  visibility flips) so the viewer just signals the intent. */
  onOpenStoryPicker?: () => void
  /** True when a story map is currently active — used to highlight
   *  the Story rail tile in the bottom rail. */
  storyActive?: boolean
}
