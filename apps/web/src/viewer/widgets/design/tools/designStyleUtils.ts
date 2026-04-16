/**
 * MightyTwin — Design Style Utilities
 * Apply FeatureStyle to Cesium entities (point, polyline, polygon, box, etc.).
 */
import {
  Entity,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
} from 'cesium'
import type { FeatureStyle } from '../types'
import { pointSymbolToDataUrl } from '../../../shared/pointSymbology'

function setProp(target: object, key: string, value: ConstantProperty) {
  (target as Record<string, unknown>)[key] = value
}

function safeCssColor(hex: string, fallback: string): Color {
  try {
    return Color.fromCssColorString(hex)
  } catch {
    return Color.fromCssColorString(fallback)
  }
}

export function applyStyleToEntity(entity: Entity, style: FeatureStyle) {
  const stroke = safeCssColor(style.strokeColor, '#22D3EE').withAlpha(style.opacity)
  const fill = safeCssColor(style.fillColor, '#22D3EE').withAlpha(style.opacity * 0.5)
  const solidFill = safeCssColor(style.fillColor, '#22D3EE').withAlpha(style.opacity * 0.65)
  const strokeProp = new ConstantProperty(stroke)
  const fillProp = new ConstantProperty(fill)
  const strokeMat = new ColorMaterialProperty(stroke)
  const fillMat = new ColorMaterialProperty(fill)
  const solidFillMat = new ColorMaterialProperty(solidFill)
  const widthProp = new ConstantProperty(style.lineWidth)
  const outlineTrue = new ConstantProperty(true)

  if (entity.billboard && style.pointSymbol) {
    setProp(entity.billboard, 'image', new ConstantProperty(pointSymbolToDataUrl(style.pointSymbol)))
  }
  if (entity.point) {
    setProp(entity.point, 'color', fillProp)
    setProp(entity.point, 'outlineColor', strokeProp)
    setProp(entity.point, 'outlineWidth', widthProp)
  }
  if (entity.polyline) {
    setProp(entity.polyline, 'material', strokeMat as unknown as ConstantProperty)
    setProp(entity.polyline, 'width', widthProp)
  }
  if (entity.polygon) {
    setProp(entity.polygon, 'material', fillMat as unknown as ConstantProperty)
    setProp(entity.polygon, 'outline', outlineTrue)
    setProp(entity.polygon, 'outlineColor', strokeProp)
    setProp(entity.polygon, 'outlineWidth', widthProp)
  }
  if (entity.ellipse) {
    setProp(entity.ellipse, 'material', fillMat as unknown as ConstantProperty)
    setProp(entity.ellipse, 'outline', outlineTrue)
    setProp(entity.ellipse, 'outlineColor', strokeProp)
    setProp(entity.ellipse, 'outlineWidth', widthProp)
  }
  if (entity.box) {
    setProp(entity.box, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.box, 'outline', outlineTrue)
    setProp(entity.box, 'outlineColor', strokeProp)
    setProp(entity.box, 'outlineWidth', widthProp)
  }
  if (entity.ellipsoid) {
    setProp(entity.ellipsoid, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.ellipsoid, 'outline', outlineTrue)
    setProp(entity.ellipsoid, 'outlineColor', strokeProp)
    setProp(entity.ellipsoid, 'outlineWidth', widthProp)
  }
  if (entity.cylinder) {
    setProp(entity.cylinder, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.cylinder, 'outline', outlineTrue)
    setProp(entity.cylinder, 'outlineColor', strokeProp)
    setProp(entity.cylinder, 'outlineWidth', widthProp)
  }
}
