/**
 * MightyTwin — Solid Commit Rendering
 * Full geometry commit functions for Box, Pit, and Cylinder.
 * Produces accurate hollow geometry (walls, floors) when wallThickness > 0.
 *
 * Anchor semantics (`refZ`):
 *   box  — 'bot' (default) sits on terrain, 'center' straddles, 'top' floats.
 *   pit  — 'top' (default) extends below terrain, 'center' straddles, 'bot' sits on.
 *   cyl  — Cylinder uses heading/pitch/roll natively; refZ is implicit (bottom).
 */
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  Math as CesiumMath,
} from 'cesium'
import type { BoxDraft, PitDraft, CylDraft } from '../types'
import { addBoxEntity, addCylinderEntity, enuOffsetToWorld } from './drawUtils'

/** Resolve refZ for a box → vertical offset of the box centre above the anchor. */
function boxAnchorOffset(refZ: BoxDraft['refZ'] | undefined, height: number): number {
  switch (refZ ?? 'bot') {
    case 'top':    return -height / 2
    case 'center': return 0
    case 'bot':
    default:       return height / 2
  }
}

/** Resolve refZ for a pit — base of pit relative to anchor altitude. */
function pitAnchorBaseOffset(refZ: PitDraft['refZ'] | undefined, height: number): number {
  switch (refZ ?? 'top') {
    case 'bot':    return 0
    case 'center': return -height / 2
    case 'top':
    default:       return -height
  }
}

export function commitBox(viewer: CesiumViewerType, draft: BoxDraft, entityId: string, fillCol: Color, outlineCol: Color) {
  const { lon, lat, alt, width, depth, height, heading, pitch, roll, wallThickness, refZ } = draft
  const headingRad = CesiumMath.toRadians(heading)
  const pitchRad = CesiumMath.toRadians(pitch || 0)
  const rollRad = CesiumMath.toRadians(roll || 0)
  const isHollow = wallThickness > 0 && wallThickness < Math.min(width, depth, height) / 2
  const centerOffsetUp = boxAnchorOffset(refZ, height)

  if (!isHollow) {
    const center = Cartesian3.fromDegrees(lon, lat, alt + centerOffsetUp)
    addBoxEntity(viewer, entityId, center, headingRad, width, depth, height, fillCol, outlineCol, pitchRad, rollRad)
  } else {
    // Compute the bottom-anchor cartesian, then offset all panels relative to it.
    const baseAlt = alt + centerOffsetUp - height / 2
    const baseCart = Cartesian3.fromDegrees(lon, lat, baseAlt)
    const t = wallThickness
    const hw = width / 2
    const hd = depth / 2
    const hh = height / 2
    const innerD = Math.max(0.01, depth - t * 2)
    const innerH = Math.max(0.01, height - t * 2)

    const panels: [string, number, number, number, number, number, number][] = [
      ['_n', 0, hd - t / 2, hh, width, t, innerH],
      ['_s', 0, -(hd - t / 2), hh, width, t, innerH],
      ['_e', hw - t / 2, 0, hh, t, innerD, innerH],
      ['_w', -(hw - t / 2), 0, hh, t, innerD, innerH],
      ['_top', 0, 0, height - t / 2, width, depth, t],
      ['_bot', 0, 0, t / 2, width, depth, t],
    ]

    for (const [suffix, e, n, u, bw, bd, bh] of panels) {
      const center = enuOffsetToWorld(baseCart, headingRad, e, n, u)
      addBoxEntity(viewer, entityId + suffix, center, headingRad, bw, bd, bh, fillCol, outlineCol, pitchRad, rollRad)
    }
  }
}

export function commitCylinder(viewer: CesiumViewerType, draft: CylDraft, entityId: string, fillCol: Color, outlineCol: Color) {
  const { lon, lat, alt, radius, height, heading, pitch, roll, wallThickness } = draft
  const headingRad = CesiumMath.toRadians(heading)
  const pitchRad = CesiumMath.toRadians(pitch)
  const rollRad = CesiumMath.toRadians(roll)
  const isHollow = wallThickness > 0 && wallThickness < radius

  const center = Cartesian3.fromDegrees(lon, lat, alt + height / 2)
  addCylinderEntity(viewer, entityId, center, headingRad, pitchRad, rollRad, radius, height, fillCol, outlineCol)

  if (isHollow) {
    const innerRadius = Math.max(0.01, radius - wallThickness)
    viewer.entities.add({
      id: entityId + '__cyl_inner',
      position: center,
      cylinder: {
        length: height,
        topRadius: innerRadius,
        bottomRadius: innerRadius,
        fill: false,
        outline: true,
        outlineColor: outlineCol.withAlpha(0.4),
        numberOfVerticalLines: 36,
      },
    })
  }
}

export function commitPit(viewer: CesiumViewerType, draft: PitDraft, entityId: string, fillCol: Color, outlineCol: Color) {
  const { lon, lat, alt, width, depth, height, heading, wallThickness, floorThickness, shape, radius, refZ } = draft
  const headingRad = CesiumMath.toRadians(heading)
  const baseAlt = alt + pitAnchorBaseOffset(refZ, height)
  const baseCart = Cartesian3.fromDegrees(lon, lat, baseAlt)

  if (shape === 'round') {
    const wallH = Math.max(0.01, height - floorThickness)

    // Floor disk
    const floorCenter = Cartesian3.fromDegrees(lon, lat, baseAlt + floorThickness / 2)
    addCylinderEntity(viewer, entityId + '_rf', floorCenter, headingRad, 0, 0, radius, floorThickness, fillCol, outlineCol)

    // Outer wall
    const wallCenter = Cartesian3.fromDegrees(lon, lat, baseAlt + floorThickness + wallH / 2)
    const wallFill = fillCol.withAlpha(0.7)
    addCylinderEntity(viewer, entityId + '_rwo', wallCenter, headingRad, 0, 0, radius, wallH, wallFill, outlineCol)

    // Inner cylinder outline
    const innerRadius = Math.max(0.01, radius - wallThickness)
    viewer.entities.add({
      id: entityId + '_rwi',
      position: wallCenter,
      cylinder: {
        length: wallH,
        topRadius: innerRadius,
        bottomRadius: innerRadius,
        fill: false,
        outline: true,
        outlineColor: outlineCol.withAlpha(0.5),
        numberOfVerticalLines: 36,
      },
    })
  } else {
    // Square pit — 4 walls + floor
    const wallH = Math.max(0.01, height - floorThickness)
    const wallCenterUp = floorThickness + wallH / 2
    const t = wallThickness
    const hw = width / 2
    const hd = depth / 2

    const walls: [string, number, number, number, number][] = [
      ['_n', 0, hd - t / 2, width, t],
      ['_s', 0, -(hd - t / 2), width, t],
      ['_e', hw - t / 2, 0, t, depth - t * 2],
      ['_w', -(hw - t / 2), 0, t, depth - t * 2],
    ]

    for (const [suffix, eOff, nOff, bw, bd] of walls) {
      const center = enuOffsetToWorld(baseCart, headingRad, eOff, nOff, wallCenterUp)
      addBoxEntity(viewer, entityId + suffix, center, headingRad, bw, bd, wallH, fillCol, outlineCol)
    }

    // Floor
    const floorCenter = enuOffsetToWorld(baseCart, headingRad, 0, 0, floorThickness / 2)
    addBoxEntity(viewer, entityId + '_f', floorCenter, headingRad, width, depth, floorThickness, fillCol, outlineCol)

    // Top-edge polyline outline so the hollow opening is obvious from overhead
    const topZ = height
    const c0 = enuOffsetToWorld(baseCart, headingRad, -hw, -hd, topZ)
    const c1 = enuOffsetToWorld(baseCart, headingRad,  hw, -hd, topZ)
    const c2 = enuOffsetToWorld(baseCart, headingRad,  hw,  hd, topZ)
    const c3 = enuOffsetToWorld(baseCart, headingRad, -hw,  hd, topZ)
    viewer.entities.add({
      id: entityId + '_top_outline',
      polyline: {
        positions: [c0, c1, c2, c3, c0],
        width: 3,
        material: new ColorMaterialProperty(outlineCol),
        clampToGround: false,
      },
    })
  }
}
