/**
 * MightyTwin — Draw Tool Utilities
 * Shared helpers for all draw tools: position picking, elevation handling,
 * feature ID generation, and entity styling.
 */
import {
  Viewer as CesiumViewerType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  HeightReference,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix4,
  Transforms,
} from 'cesium'
import type { ElevationConfig, ElevationDatum, FeatureStyle } from '../types'
import { DEFAULT_FEATURE_STYLE } from '../types'


export function makeFeatureId(): string {
  return 'feat_' + Math.random().toString(36).slice(2, 9)
}

/**
 * Pick a globe position from a screen coordinate, applying the elevation config.
 */
export function pickPosition(
  viewer: CesiumViewerType,
  screenPos: Cartesian2,
  elevConfig: ElevationConfig,
): Cartesian3 | null {
  const ray = viewer.camera.getPickRay(screenPos)
  if (!ray) return null

  let hit: Cartesian3 | undefined

  if (elevConfig.datum === 'terrain' || elevConfig.datum === 'custom_terrain') {
    // globe.pick is most accurate when tiles are loaded
    hit = viewer.scene.globe.pick(ray, viewer.scene)
    // Fall back to depth-buffer pick (works even when tiles not fully loaded, needs pickTranslucentDepth=true)
    if (!hit) hit = viewer.scene.pickPosition(screenPos)
    // Last resort: ellipsoid
    if (!hit) hit = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ?? undefined
  } else {
    // ellipsoid or mga2020
    hit = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ?? undefined
  }

  if (!hit) return null

  const carto = Cartographic.fromCartesian(hit)
  carto.height += elevConfig.offset
  return Cartographic.toCartesian(carto)
}

/** Determine the Cesium HeightReference for a given datum and offset. */
export function heightReferenceForDatum(datum: ElevationDatum, offset: number): HeightReference {
  if (datum === 'terrain' || datum === 'custom_terrain') {
    return offset === 0 ? HeightReference.CLAMP_TO_GROUND : HeightReference.RELATIVE_TO_GROUND
  }
  return HeightReference.NONE
}

/** Whether polylines/polygons should clamp to ground for this datum. */
export function clampToGroundForDatum(datum: ElevationDatum): boolean {
  return datum === 'terrain' || datum === 'custom_terrain'
}

/** Convert a Cartesian3 to [lon, lat, alt] degrees. */
export function cartesianToDegrees(c: Cartesian3): [number, number, number] {
  const carto = Cartographic.fromCartesian(c)
  return [
    CesiumMath.toDegrees(carto.longitude),
    CesiumMath.toDegrees(carto.latitude),
    carto.height,
  ]
}

/** Build a default feature style from a layer colour. */
export function styleFromLayerColour(colour: string): FeatureStyle {
  return { ...DEFAULT_FEATURE_STYLE, strokeColor: colour, fillColor: colour }
}

// ─── Solid Tool Helpers ─────────────────────────────────────────────────────

/**
 * Convert a local ENU (east, north, up) offset to a world Cartesian3,
 * rotated by `headingRad` around the given base position.
 */
export function enuOffsetToWorld(
  base: Cartesian3,
  headingRad: number,
  east: number,
  north: number,
  up: number,
): Cartesian3 {
  const cosH = Math.cos(headingRad)
  const sinH = Math.sin(headingRad)
  const re = east * cosH - north * sinH
  const rn = east * sinH + north * cosH
  const enuMatrix = Transforms.eastNorthUpToFixedFrame(base)
  const world = Matrix4.multiplyByPoint(enuMatrix, new Cartesian3(re, rn, up), new Cartesian3())
  const carto = Cartographic.fromCartesian(world)
  return Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height)
}

/** Create a box entity and add it to the viewer. */
export function addBoxEntity(
  viewer: CesiumViewerType,
  entityId: string,
  center: Cartesian3,
  headingRad: number,
  width: number,
  depth: number,
  height: number,
  fill: Color,
  outline: Color,
) {
  const hpr = new HeadingPitchRoll(headingRad, 0, 0)
  const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
  viewer.entities.add({
    id: entityId,
    position: center,
    orientation: new ConstantProperty(orientation),
    box: {
      dimensions: new Cartesian3(width, depth, height),
      material: new ColorMaterialProperty(fill),
      fill: true,
      outline: true,
      outlineColor: outline,
    },
  })
}

/** Create a cylinder entity and add it to the viewer. */
export function addCylinderEntity(
  viewer: CesiumViewerType,
  entityId: string,
  center: Cartesian3,
  headingRad: number,
  pitchRad: number,
  rollRad: number,
  radius: number,
  length: number,
  fill: Color,
  outline: Color,
) {
  const hpr = new HeadingPitchRoll(headingRad, pitchRad, rollRad)
  const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
  viewer.entities.add({
    id: entityId,
    position: center,
    orientation: new ConstantProperty(orientation),
    cylinder: {
      length,
      topRadius: radius,
      bottomRadius: radius,
      material: new ColorMaterialProperty(fill),
      fill: true,
      outline: true,
      outlineColor: outline,
      numberOfVerticalLines: 36,
    },
  })
}
