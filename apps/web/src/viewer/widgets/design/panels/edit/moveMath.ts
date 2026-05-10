/** Move-math helpers — bearing+distance translation in WGS84.
 *
 *  Equirectangular approximation. For the design-widget granularity
 *  (typically <1 km per move) it's accurate to within a few cm at
 *  mid-latitudes. v1's helper does the same.
 */

const EARTH_R = 6_378_137  // metres, WGS84 equatorial

/** Translate (lon, lat) by `distance` metres along a `bearing` (deg
 *  from N, clockwise). Returns a new [lon, lat]. Altitude passes
 *  through unchanged. */
export function geodesicOffset(
  lon: number,
  lat: number,
  bearingDeg: number,
  distanceM: number,
): { lon: number; lat: number } {
  const brg = (bearingDeg * Math.PI) / 180
  const lat0 = (lat * Math.PI) / 180
  const dN = Math.cos(brg) * distanceM
  const dE = Math.sin(brg) * distanceM
  const dLat = dN / EARTH_R
  const dLon = dE / (EARTH_R * Math.cos(lat0))
  return {
    lon: lon + (dLon * 180) / Math.PI,
    lat: lat + (dLat * 180) / Math.PI,
  }
}

/** Inverse — bearing (deg) + distance (m) from one lon/lat to another. */
export function geodesicInverse(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
): { bearing: number; distance: number } {
  const lat0 = (fromLat * Math.PI) / 180
  const dLat = ((toLat - fromLat) * Math.PI) / 180
  const dLon = ((toLon - fromLon) * Math.PI) / 180
  const dN = dLat * EARTH_R
  const dE = dLon * EARTH_R * Math.cos(lat0)
  const distance = Math.hypot(dN, dE)
  let bearing = (Math.atan2(dE, dN) * 180) / Math.PI
  if (bearing < 0) bearing += 360
  return { bearing, distance }
}

/** Shift every position in an array by the same delta (dLon, dLat, dAlt).
 *  Used when the user changes the anchor of a multi-vertex feature. */
export function shiftPositions(
  positions: ReadonlyArray<readonly number[]>,
  dLon: number,
  dLat: number,
  dAlt: number,
): [number, number, number][] {
  return positions.map(p => [
    (p[0] ?? 0) + dLon,
    (p[1] ?? 0) + dLat,
    (p[2] ?? 0) + dAlt,
  ])
}
