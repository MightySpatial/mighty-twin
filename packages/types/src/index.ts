/**
 * @mightyspatial/types — shared API contract types for Mighty platform apps.
 *
 * These types describe data exchanged between any Mighty platform frontend
 * (dev-web, mighty-lite, mighty-twin viewer/admin) and its FastAPI backend.
 * They are the source of truth for TypeScript consumers; Zod schemas are
 * auto-generated from FastAPI /openapi.json to keep the two in sync.
 */

import type { BBox, Geometry } from 'geojson'

export type { BBox, Geometry }

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AuthProvider = 'google' | 'microsoft' | 'email';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'pending';
  provider: AuthProvider;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'creator' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OAuthCallbackParams {
  code: string;
  state: string;
  provider: AuthProvider;
}

// ─── Sites ───────────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  slug: string;
  description?: string;
  bounds?: BBox;
  defaultCamera?: CameraPosition;
  layers: Layer[];
  widgets: WidgetConfig[];
  branding?: SiteBranding;
  access: SiteAccess;
  createdAt: string;
  updatedAt: string;
}

export interface SiteBranding {
  logo?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface SiteAccess {
  public: boolean;
  allowedUsers?: string[];
  allowedRoles?: UserRole[];
}

export interface CameraPosition {
  longitude: number;
  latitude: number;
  height: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}

// ─── Layers ──────────────────────────────────────────────────────────────────

export interface Layer {
  id: string;
  siteId: string;
  name: string;
  type: LayerType;
  dataSourceId?: string;
  visible: boolean;
  opacity: number;
  order: number;
  style?: LayerStyle;
  metadata?: Record<string, unknown>;
}

export type LayerType = 
  | 'vector'      // GeoJSON, Shapefile
  | 'raster'      // COG, imagery
  | 'terrain'     // Cesium terrain
  | '3d-tiles'    // Cesium 3D Tiles
  | 'splat'       // Gaussian splats
  | 'wms'         // WMS service
  | 'wmts'        // WMTS service
  ;

export interface LayerStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  pointSize?: number;
  extrudeHeight?: number | string; // Can be property name
  // Pipe / PolylineVolume rendering
  pipeRadiusM?: number;
  pipeDepthMode?: PipeDepthMode;
  wallThicknessM?: number;
  pipeDepthModeAttribute?: string; // per-feature attribute override
}

// ─── Pipe Depth Modes ────────────────────────────────────────────────────────

/**
 * AutoCAD-style 5-level pipe placement reference.
 * Describes which part of the pipe cross-section the input Z values reference.
 *
 *   outsideTop    — top of pipe outer surface
 *   obvert        — inside top (crown); most common in utility survey
 *   centerline    — pipe centreline (default, no offset)
 *   invert        — inside bottom
 *   outsideBottom — bottom of pipe outer surface
 */
export type PipeDepthMode =
  | 'outsideTop'
  | 'obvert'
  | 'centerline'
  | 'invert'
  | 'outsideBottom';

export const PIPE_DEPTH_MODES: PipeDepthMode[] = [
  'outsideTop',
  'obvert',
  'centerline',
  'invert',
  'outsideBottom',
];

export const PIPE_DEPTH_MODE_LABELS: Record<PipeDepthMode, string> = {
  outsideTop:    'Outside Top',
  obvert:        'Obvert (Crown)',
  centerline:    'Centerline',
  invert:        'Invert',
  outsideBottom: 'Outside Bottom',
};

// ─── Data Sources ────────────────────────────────────────────────────────────

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  format: string;
  size: number; // bytes
  url?: string;
  bucket?: string;
  key?: string;
  bounds?: BBox;
  crs?: string;
  featureCount?: number;
  attributes?: AttributeSchema[];
  status: DataSourceStatus;
  createdAt: string;
  updatedAt: string;
}

export type DataSourceType = 'vector' | 'raster' | '3d-tiles' | 'ifc' | 'pointcloud' | 'splat';
export type DataSourceStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface AttributeSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  nullable: boolean;
}

// ─── Widgets ─────────────────────────────────────────────────────────────────

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  enabled: boolean;
  position?: WidgetPosition;
  config?: Record<string, unknown>;
}

export type WidgetType = 
  | 'layer-tree'
  | 'legend'
  | 'measure'
  | 'draw'
  | 'search'
  | 'basemap'
  | 'attribute-table'
  | 'feature-info'
  | 'timeline'
  | 'ai-chat'
  ;

export type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'panel';

// ─── Library ─────────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  size?: number;
  parentId?: string;
  url?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
