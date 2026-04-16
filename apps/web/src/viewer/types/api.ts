/**
 * MightyTwin — Typed API response interfaces
 * Central definitions for all API and external service responses.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: 'admin' | 'creator' | 'viewer'
}

export interface AuthTokenResponse {
  access_token: string
  refresh_token: string
}

export interface AuthErrorResponse {
  detail: string
}

// ─── System ──────────────────────────────────────────────────────────────────

export interface SystemConfig {
  cesium_ion_token?: string
}

// ─── Spatial — Sites ─────────────────────────────────────────────────────────

export interface SiteListItem {
  id: string
  name: string
  slug: string
  layer_count: number
}

export interface CameraPosition {
  longitude: number
  latitude: number
  height: number
  heading?: number
  pitch?: number
  roll?: number
}

export interface LayerMetadata {
  renderAs?: 'pipe' | string
  pipeRadiusM?: number
  pipeDepthMode?: string
  wallThicknessM?: number
  [key: string]: unknown
}

export interface LayerStyle {
  renderType?: 'single' | 'categorized' | 'graduated'
  color?: string
  single?: {
    strokeColor?: string
    fillColor?: string
    opacity?: number
    lineWidth?: number
    pointSize?: number
    pointShape?: string
  }
  categorized?: {
    field: string
    categories: Array<{ value: string | number | null; color: string; label: string }>
    default?: string
  }
  graduated?: {
    field: string
    colorRamp?: string
    breaks: Array<{ min: number; max: number; color: string; label: string }>
  }
  labels?: {
    enabled: boolean
    field: string
    fontSize?: number
    color?: string
    haloColor?: string
  }
  wmsLayers?: string
  wmtsLayer?: string
  wmtsStyle?: string
  tileMatrixSet?: string
  [key: string]: unknown
}

export type LayerType = 'vector' | 'raster' | 'terrain' | '3d-tiles' | 'splat' | 'wms' | 'wmts'

export interface LayerData {
  id: string
  name: string
  type: LayerType
  url?: string
  visible: boolean
  opacity: number
  order: number
  style?: LayerStyle
  layer_metadata?: LayerMetadata
}

export interface SiteData {
  id: string
  name: string
  slug: string
  description?: string
  default_camera?: CameraPosition
  logo_url?: string
  primary_color?: string
  marker_color?: string
  marker_symbol?: string
  is_public: boolean
  layer_count: number
  layers: LayerData[]
  overlay_config?: OverlayConfig
}

// ─── Overlay Config (per-site) ──────────────────────────────────────────────

export interface OverlayConfig {
  info_widget_enabled?: boolean
  info_widget_title?: string
  info_widget_content?: string
  zoom_splash_enabled?: boolean
  zoom_splash_title?: string
  zoom_splash_content?: string
  zoom_splash_auto_dismiss_secs?: number
}

// ─── Public Settings ────────────────────────────────────────────────────────

export interface PublicSettings {
  login_splash_enabled: boolean
  login_splash_title?: string
  login_splash_message?: string
  login_splash_bg_url?: string
  home_widget_enabled: boolean
  home_widget_title?: string
  home_widget_message?: string
  home_widget_support_email?: string
  overview_camera_lon?: number
  overview_camera_lat?: number
  overview_camera_height?: number
}

// ─── Story Maps ──────────────────────────────────────────────────────────────

export interface SlideCamera {
  longitude: number
  latitude: number
  height: number
  heading?: number
  pitch?: number
  roll?: number
}

export interface Slide {
  title: string
  narrative: string
  camera: SlideCamera
  visible_layers?: string[]
  duration?: number
}

export interface StoryMap {
  id: string
  site_id: string
  name: string
  description?: string
  is_published: boolean
  slides: Slide[]
}

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

export interface GeoJSONGeometry {
  type: string
  coordinates: number[] | number[][] | number[][][] | number[][][][]
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry | null
  properties: Record<string, unknown> | null
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// ─── Nominatim (OpenStreetMap geocoder) ──────────────────────────────────────

export interface NominatimResult {
  place_id: number
  licence: string
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  display_name: string
  boundingbox: [string, string, string, string]
}

// ─── Extension site config state ─────────────────────────────────────────────

export type SiteConfigState = Record<string, unknown>
