export type BasemapProvider = 'osm' | 'ion-bing' | 'ion-sentinel'
export type LengthUnit = 'metric' | 'imperial'
export type CoordinateFormat = 'dd' | 'dms' | 'mgrs'
export type ThemeMode = 'dark' | 'light' | 'system'
export type Density = 'compact' | 'comfortable'
export type AdminView = 'dev-tools' | 'mock'

export interface AppSettings {
  basemap: {
    provider: BasemapProvider
    ionToken: string
    terrainEnabled: boolean
  }
  units: {
    length: LengthUnit
    coordinates: CoordinateFormat
  }
  widgets: {
    enabled: Record<string, boolean>
    showDebugOverlays: boolean
  }
  theme: {
    mode: ThemeMode
    density: Density
  }
  admin: {
    view: AdminView
  }
  /** Developer-only controls (breakpoint toggle, orientation toggle,
   *  dev-tools admin variant, debug overlays). Default matches the build
   *  type (true in dev, false in production). Users can flip the toggle
   *  in Settings → Developer regardless. */
  dev: {
    enabled: boolean
  }
}

const IS_DEV_BUILD =
  typeof import.meta !== 'undefined' &&
  !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV

export const DEFAULT_SETTINGS: AppSettings = {
  basemap: { provider: 'osm', ionToken: '', terrainEnabled: false },
  units: { length: 'metric', coordinates: 'dd' },
  widgets: { enabled: {}, showDebugOverlays: false },
  theme: { mode: 'dark', density: 'comfortable' },
  admin: { view: 'dev-tools' },
  dev: { enabled: IS_DEV_BUILD },
}

export const STORAGE_KEY = 'mighty-settings-v1'
export const CHANGE_EVENT = 'mighty-settings-change'
