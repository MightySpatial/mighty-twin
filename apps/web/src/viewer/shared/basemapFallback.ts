/** Fallback basemap helper.
 *
 *  Cesium's `Viewer` constructor defaults to Bing Aerial via Ion. In
 *  practice it works out of the box because Cesium ships a bundled
 *  default Ion token that grants free Bing imagery on most domains.
 *  Together with the env / server / user token tiers in
 *  `useTokenFetch`, `Ion.defaultAccessToken` is almost never empty.
 *
 *  This helper exists for the rare case where someone explicitly
 *  clears the bundled token (e.g. a privacy-conscious deploy) — when
 *  `Ion.defaultAccessToken` is empty we swap in OpenStreetMap +
 *  the default ellipsoid terrain so the globe still paints
 *  something useful. With any token present, falls through to the
 *  original Ion-backed defaults (Bing imagery + world terrain).
 *
 *  Used by every place that calls `new Viewer(...)`:
 *  CesiumViewer (per-site), SitesMapPage (all-sites overview),
 *  SitesMapView (Atlas map view). */

import {
  Ion,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  Terrain,
} from 'cesium'

export interface BasemapFallbackOptions {
  /** Pass to `new Viewer(..., { baseLayer, terrain, ... })`. */
  baseLayer: ImageryLayer | false | undefined
  /** Pass to `new Viewer(..., { ..., terrain })`. */
  terrain: Terrain | undefined
  /** True when running without an Ion token — useful for downstream
   *  state machines (e.g. `useBasemap` defaults). */
  usingFallback: boolean
}

/** Returns Viewer constructor options with OSM as the fallback when
 *  no Ion token is configured. Read this RIGHT BEFORE constructing
 *  the Viewer — `Ion.defaultAccessToken` is set by `useTokenFetch`
 *  during the initial render, so this must run after `tokenReady`. */
export function getBasemapFallbackOptions(): BasemapFallbackOptions {
  const hasIonToken = !!Ion.defaultAccessToken
  if (hasIonToken) {
    return {
      // Undefined → Cesium uses its built-in default (Bing Aerial via Ion).
      baseLayer: undefined,
      terrain: Terrain.fromWorldTerrain(),
      usingFallback: false,
    }
  }
  return {
    baseLayer: new ImageryLayer(
      new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      }),
    ),
    // World terrain requires Ion; fall back to the default ellipsoid.
    terrain: undefined,
    usingFallback: true,
  }
}
