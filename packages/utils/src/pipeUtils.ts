/**
 * Pipe utilities (Cesium-agnostic).
 *
 * Depth-offset math is kept here so it can be shared between the viewer
 * (which applies it to Cesium Cartesian3 positions) and any server-side
 * or testing code that works with raw [lon, lat, z] coordinates.
 */

import type { PipeDepthMode } from '@mightyspatial/types'
export { PIPE_DEPTH_MODES, PIPE_DEPTH_MODE_LABELS } from '@mightyspatial/types'

export const PIPE_MIN_SEGMENT_LENGTH = 1.0; // metres
export const PIPE_UTURN_THRESHOLD_DEG = 10.0;

/**
 * Compute the vertical (up-direction) Z offset in metres that must be
 * applied to input positions so that the rendered PolylineVolume centreline
 * matches the supplied depth reference.
 *
 * Positive = shift up, negative = shift down.
 *
 * @param depthMode   - which part of the pipe section the input Z values reference
 * @param radiusM     - outer pipe radius in metres
 * @param wallThicknessM - wall thickness in metres (0 = no wall)
 */
export function pipeDepthZOffset(
  depthMode: PipeDepthMode,
  radiusM: number,
  wallThicknessM = 0,
): number {
  const r = Math.max(0, radiusM);
  const w = Math.max(0, Math.min(wallThicknessM, r));
  const innerR = r - w;

  switch (depthMode) {
    case 'outsideTop':    return -r;       // input at outer top → centre is below
    case 'obvert':        return -innerR;  // input at inner top (crown) → centre is below
    case 'centerline':    return 0;        // no offset
    case 'invert':        return +innerR;  // input at inner bottom → centre is above
    case 'outsideBottom': return +r;       // input at outer bottom → centre is above
    default:              return 0;
  }
}

/**
 * Apply depth offset to an array of [longitude, latitude, altitude] tuples.
 * The offset is applied to the altitude component only.
 *
 * For Cesium Cartesian3 positions, use the viewer-side `applyPipeDepthOffsetCartesian`
 * which handles the proper geodetic up-normal.
 */
export function applyPipeDepthOffsetLLA(
  positions: [number, number, number][],
  depthMode: PipeDepthMode,
  radiusM: number,
  wallThicknessM = 0,
): [number, number, number][] {
  const zOffset = pipeDepthZOffset(depthMode, radiusM, wallThicknessM);
  if (zOffset === 0) return positions;
  return positions.map(([lon, lat, alt]) => [lon, lat, alt + zOffset]);
}
