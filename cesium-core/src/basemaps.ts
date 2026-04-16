/**
 * Canonical basemap presets shipped with Mighty platform.
 *
 * Apps can extend this list; widgets like `@mightyspatial/widget-basemap`
 * read from the host's final resolved list, not this file directly.
 */

export type BasemapKind = 'imagery' | 'streets' | 'satellite' | 'dark' | 'topo'

export interface BasemapPreset {
  id: string
  name: string
  kind: BasemapKind
  /**
   * The provider used to construct the imagery layer. Kept as a loose string
   * so apps can plug in providers without cesium-core taking a hard dep on
   * every one (Mapbox, MapTiler, Bing, local tiles, …).
   */
  provider:
    | { type: 'cesium-ion'; assetId: number }
    | { type: 'url'; url: string; credit?: string }
    | { type: 'openstreetmap' }
  attribution?: string
}

export const basemaps: BasemapPreset[] = [
  {
    id: 'cesium-world-imagery',
    name: 'Cesium World Imagery',
    kind: 'satellite',
    provider: { type: 'cesium-ion', assetId: 2 },
    attribution: '© Cesium ION',
  },
  {
    id: 'openstreetmap',
    name: 'OpenStreetMap',
    kind: 'streets',
    provider: { type: 'openstreetmap' },
    attribution: '© OpenStreetMap contributors',
  },
]

export const defaultBasemap: BasemapPreset = basemaps[0]!
