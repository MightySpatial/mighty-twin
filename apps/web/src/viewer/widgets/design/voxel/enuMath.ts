/**
 * ENU coordinate math for the voxel SVO.
 *
 * Each SVOLayer owns a `datum` — a WGS84 lon/lat/alt point that nails
 * the integer ENU grid. Block (i,j,k,level) occupies the cube
 * [i·s, (i+1)·s] × [j·s, (j+1)·s] × [k·s, (k+1)·s] in metres along
 * (east, north, up) of the local ENU frame at the datum, where
 * s = blockSizeAtLevel(level).
 *
 * For ENU↔ECEF we use Cesium's eastNorthUpToFixedFrame which builds
 * the local-tangent rotation at the datum once. That's the same
 * approximation Cesium uses internally for entity placement, accurate
 * to mm at the design widget's scale (sites are typically a few km
 * across). For larger areas the rotation should be re-derived per
 * chunk; we keep it per-layer for simplicity and let datum placement
 * handle granularity.
 */
import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Matrix4,
  Transforms,
} from 'cesium'
import { BASE_BLOCK_SIZE, CHUNK_SIZE, type SVODatum } from './types'

/** Edge length of a block at the given octree level, in metres. */
export function blockSizeAtLevel(level: number): number {
  return BASE_BLOCK_SIZE * Math.pow(2, level)
}

/** Block-grid index → ENU metres at the centre of the cell. The
 *  centre (rather than the min-corner) is more useful for hit-testing
 *  and rendering — the corner can be derived by subtracting size/2. */
export function blockToEnu(
  i: number,
  j: number,
  k: number,
  level: number,
): [number, number, number] {
  const s = blockSizeAtLevel(level)
  return [(i + 0.5) * s, (j + 0.5) * s, (k + 0.5) * s]
}

/** ENU metres → block-grid index. Rounds via floor so that any point
 *  inside the cube [i·s, (i+1)·s] maps back to (i,j,k). */
export function enuToBlock(
  east: number,
  north: number,
  up: number,
  level: number,
): [number, number, number] {
  const s = blockSizeAtLevel(level)
  return [Math.floor(east / s), Math.floor(north / s), Math.floor(up / s)]
}

/** WGS84 datum → ECEF Cartesian3. */
export function datumToEcef(datum: SVODatum): Cartesian3 {
  return Cartesian3.fromDegrees(datum.lon, datum.lat, datum.alt)
}

/** Build (and cache per call) the 4×4 ENU→ECEF transform at the datum. */
function enuFrame(datum: SVODatum): Matrix4 {
  return Transforms.eastNorthUpToFixedFrame(datumToEcef(datum))
}

/** ENU metres at the datum's local frame → ECEF Cartesian3. */
export function enuToEcef(
  east: number,
  north: number,
  up: number,
  datum: SVODatum,
): Cartesian3 {
  const m = enuFrame(datum)
  const enu = new Cartesian3(east, north, up)
  return Matrix4.multiplyByPoint(m, enu, new Cartesian3())
}

/** ECEF Cartesian3 → ENU metres at the datum's local frame. */
export function ecefToEnu(
  cartesian: Cartesian3,
  datum: SVODatum,
): [number, number, number] {
  const m = enuFrame(datum)
  const inv = Matrix4.inverseTransformation(m, new Matrix4())
  const enu = Matrix4.multiplyByPoint(inv, cartesian, new Cartesian3())
  return [enu.x, enu.y, enu.z]
}

/** Convenience — WGS84 lon/lat/alt → ENU metres at the datum. */
export function lonLatAltToEnu(
  lon: number,
  lat: number,
  alt: number,
  datum: SVODatum,
): [number, number, number] {
  const ecef = Cartesian3.fromDegrees(lon, lat, alt)
  return ecefToEnu(ecef, datum)
}

/** Convenience — ENU metres at the datum → WGS84 lon/lat/alt. */
export function enuToLonLatAlt(
  east: number,
  north: number,
  up: number,
  datum: SVODatum,
): { lon: number; lat: number; alt: number } {
  const ecef = enuToEcef(east, north, up, datum)
  const carto = Cartographic.fromCartesian(ecef)
  return {
    lon: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    alt: carto.height,
  }
}

/** Chunk grid coords → ENU metres at the chunk's min-corner. */
export function chunkOriginEnu(
  ci: number,
  cj: number,
  ck: number,
  level: number,
): [number, number, number] {
  const s = blockSizeAtLevel(level)
  return [ci * CHUNK_SIZE * s, cj * CHUNK_SIZE * s, ck * CHUNK_SIZE * s]
}

/** Block (i,j,k,level) → containing chunk grid coords. JS `Math.floor`
 *  rather than `i / CHUNK_SIZE | 0` so negative indices round toward
 *  −∞ (i = −1 lives in chunk ci = −1, not 0). */
export function positionToChunkCoords(
  i: number,
  j: number,
  k: number,
): { ci: number; cj: number; ck: number } {
  return {
    ci: Math.floor(i / CHUNK_SIZE),
    cj: Math.floor(j / CHUNK_SIZE),
    ck: Math.floor(k / CHUNK_SIZE),
  }
}

/** Block-grid altitude (the `up` axis of the ENU frame) for cell k.
 *  Adds the centre-offset and the datum altitude so the result is
 *  comparable against fillElevationAlt in waterFill. */
export function blockAltitude(k: number, level: number, datum: SVODatum): number {
  const [, , up] = blockToEnu(0, 0, k, level)
  return datum.alt + up
}
