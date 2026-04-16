/**
 * MightyTwin — Pipe Utilities (self-contained, no workspace deps)
 * Cesium-specific pipe rendering utilities with depth mode support.
 */
import { Cartesian2, Cartesian3, Ellipsoid } from 'cesium'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipeDepthMode =
  | 'outsideTop'
  | 'obvert'
  | 'centerline'
  | 'invert'
  | 'outsideBottom'

export const PIPE_DEPTH_MODES: PipeDepthMode[] = [
  'outsideTop',
  'obvert',
  'centerline',
  'invert',
  'outsideBottom',
]

export const PIPE_DEPTH_MODE_LABELS: Record<PipeDepthMode, string> = {
  outsideTop:    'Outside Top',
  obvert:        'Obvert (crown)',
  centerline:    'Centreline',
  invert:        'Invert',
  outsideBottom: 'Outside Bottom',
}

export const PIPE_MIN_SEGMENT_LENGTH = 1.0   // metres
export const PIPE_UTURN_THRESHOLD_DEG = 10.0

// ─── Depth offset ─────────────────────────────────────────────────────────────

export function pipeDepthZOffset(
  depthMode: PipeDepthMode,
  radiusM: number,
  wallThicknessM = 0,
): number {
  const r = Math.max(0, radiusM)
  const w = Math.max(0, Math.min(wallThicknessM, r))
  const innerR = r - w
  switch (depthMode) {
    case 'outsideTop':    return -r
    case 'obvert':        return -innerR
    case 'centerline':    return 0
    case 'invert':        return +innerR
    case 'outsideBottom': return +r
    default:              return 0
  }
}

// ─── Position sanitisation ────────────────────────────────────────────────────

export function pipeSanitizePositions(positions: Cartesian3[]): Cartesian3[] | null {
  if (!positions || positions.length < 2) return null

  let pts = [positions[0]]
  for (let i = 1; i < positions.length; i++) {
    const d = Cartesian3.distance(pts[pts.length - 1], positions[i])
    if (Number.isFinite(d) && d >= PIPE_MIN_SEGMENT_LENGTH) pts.push(positions[i])
  }
  if (pts.length < 2) return null

  const uTurnThresholdRad = (Math.PI / 180) * (180 - PIPE_UTURN_THRESHOLD_DEG)
  const _s1 = new Cartesian3()
  const _s2 = new Cartesian3()

  let changed = true
  while (changed && pts.length > 2) {
    changed = false
    const keep: boolean[] = [true]
    for (let i = 1; i < pts.length - 1; i++) {
      Cartesian3.subtract(pts[i], pts[i - 1], _s1)
      Cartesian3.subtract(pts[i + 1], pts[i], _s2)
      const m1 = Cartesian3.magnitude(_s1)
      const m2 = Cartesian3.magnitude(_s2)
      if (m1 < 1e-10 || m2 < 1e-10) { keep.push(false); changed = true; continue }
      Cartesian3.divideByScalar(_s1, m1, _s1)
      Cartesian3.divideByScalar(_s2, m2, _s2)
      const dot = Math.max(-1, Math.min(1, Cartesian3.dot(_s1, _s2)))
      if (Math.acos(dot) > uTurnThresholdRad) { keep.push(false); changed = true }
      else keep.push(true)
    }
    keep.push(true)
    if (changed) {
      pts = pts.filter((_, i) => keep[i])
      let prev = pts[0]
      const out = [prev]
      for (let j = 1; j < pts.length; j++) {
        const d = Cartesian3.distance(prev, pts[j])
        if (Number.isFinite(d) && d >= PIPE_MIN_SEGMENT_LENGTH) { out.push(pts[j]); prev = pts[j] }
      }
      pts = out
      if (pts.length < 2) return null
    }
  }

  // Remove collinear (sin < 2%)
  const _cross = new Cartesian3()
  let crossChanged = true
  while (crossChanged && pts.length > 2) {
    crossChanged = false
    const keep: boolean[] = [true]
    for (let i = 1; i < pts.length - 1; i++) {
      Cartesian3.subtract(pts[i], pts[i - 1], _s1)
      Cartesian3.subtract(pts[i + 1], pts[i], _s2)
      Cartesian3.cross(_s1, _s2, _cross)
      const cm = Cartesian3.magnitude(_cross)
      const m1 = Cartesian3.magnitude(_s1)
      const m2 = Cartesian3.magnitude(_s2)
      const sin = (m1 > 1e-10 && m2 > 1e-10) ? cm / (m1 * m2) : 0
      if (sin < 0.02) { keep.push(false); crossChanged = true }
      else keep.push(true)
    }
    keep.push(true)
    if (crossChanged) pts = pts.filter((_, i) => keep[i])
  }

  if (pts.length < 2) return null
  for (const p of pts) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null
  }
  return pts
}

// ─── Depth offset (Cesium Cartesian3) ────────────────────────────────────────

export function applyPipeDepthOffsetCartesian(
  positions: Cartesian3[],
  depthMode: PipeDepthMode,
  radiusM: number,
  wallThicknessM = 0,
): Cartesian3[] {
  const zOffset = pipeDepthZOffset(depthMode, radiusM, wallThicknessM)
  if (zOffset === 0) return positions
  const scratch = new Cartesian3()
  return positions.map(p => {
    const up = Ellipsoid.WGS84.geodeticSurfaceNormal(p, scratch)
    return Cartesian3.add(
      p,
      Cartesian3.multiplyByScalar(up, zOffset, new Cartesian3()),
      new Cartesian3(),
    )
  })
}

// ─── Circle cross-section ─────────────────────────────────────────────────────

export function computePipeCircleShape(
  radiusMeters: number,
  segments = 32,
): Cartesian2[] {
  const r = Math.max(0.001, radiusMeters)
  const pts: Cartesian2[] = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    pts.push(new Cartesian2(r * Math.cos(t), r * Math.sin(t)))
  }
  return pts
}
