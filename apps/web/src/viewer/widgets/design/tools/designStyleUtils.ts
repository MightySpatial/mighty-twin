/**
 * MightyTwin — Design Style Utilities
 * Apply FeatureStyle to Cesium entities (point, polyline, polygon, box, etc.).
 *
 * Honours v1 style fields: lineDash (Solid/Dash/Dot/Dash-dot), fillOpacity,
 * outlineColor / outlineWidth, pointSize, pointShape, labelField / labelSize.
 */
import {
  Entity,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  PolylineDashMaterialProperty,
  LabelStyle,
  HorizontalOrigin,
  VerticalOrigin,
  Cartesian2,
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

/** Map lineDash to a Cesium dash-pattern integer (16-bit on/off mask). */
function dashPattern(p: FeatureStyle['lineDash']): number | null {
  switch (p) {
    case 'dash': return 0xFF00
    case 'dot': return 0xCCCC
    case 'dashdot': return 0xFC78
    case 'solid':
    default: return null
  }
}

export function applyStyleToEntity(entity: Entity, style: FeatureStyle, attributes?: Record<string, unknown>) {
  const stroke = safeCssColor(style.strokeColor, '#22D3EE').withAlpha(style.opacity)
  const fillAlpha = (style.fillOpacity ?? style.opacity) * 0.5
  const solidFillAlpha = (style.fillOpacity ?? style.opacity) * 0.65
  const fill = safeCssColor(style.fillColor, '#22D3EE').withAlpha(fillAlpha)
  const solidFill = safeCssColor(style.fillColor, '#22D3EE').withAlpha(solidFillAlpha)
  const outline = safeCssColor(style.outlineColor ?? style.strokeColor, '#22D3EE').withAlpha(style.opacity)
  const outlineWidth = new ConstantProperty(style.outlineWidth ?? style.lineWidth)
  const strokeProp = new ConstantProperty(stroke)
  const fillProp = new ConstantProperty(fill)
  const outlineProp = new ConstantProperty(outline)
  const fillMat = new ColorMaterialProperty(fill)
  const solidFillMat = new ColorMaterialProperty(solidFill)
  const widthProp = new ConstantProperty(style.lineWidth)
  const outlineTrue = new ConstantProperty(true)

  // Polyline material — solid or dashed depending on lineDash.
  const dashMask = dashPattern(style.lineDash)
  const polylineMat = dashMask != null
    ? new PolylineDashMaterialProperty({ color: stroke, dashPattern: dashMask })
    : new ColorMaterialProperty(stroke)

  if (entity.billboard && style.pointSymbol) {
    setProp(entity.billboard, 'image', new ConstantProperty(pointSymbolToDataUrl(style.pointSymbol)))
  }
  if (entity.point) {
    setProp(entity.point, 'color', fillProp)
    setProp(entity.point, 'outlineColor', outlineProp)
    setProp(entity.point, 'outlineWidth', outlineWidth)
    if (typeof style.pointSize === 'number') {
      setProp(entity.point, 'pixelSize', new ConstantProperty(style.pointSize))
    }
  }
  if (entity.polyline) {
    setProp(entity.polyline, 'material', polylineMat as unknown as ConstantProperty)
    setProp(entity.polyline, 'width', widthProp)
  }
  if (entity.polygon) {
    setProp(entity.polygon, 'material', fillMat as unknown as ConstantProperty)
    setProp(entity.polygon, 'outline', outlineTrue)
    setProp(entity.polygon, 'outlineColor', outlineProp)
    setProp(entity.polygon, 'outlineWidth', outlineWidth)
  }
  if (entity.ellipse) {
    setProp(entity.ellipse, 'material', fillMat as unknown as ConstantProperty)
    setProp(entity.ellipse, 'outline', outlineTrue)
    setProp(entity.ellipse, 'outlineColor', outlineProp)
    setProp(entity.ellipse, 'outlineWidth', outlineWidth)
  }
  if (entity.box) {
    setProp(entity.box, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.box, 'outline', outlineTrue)
    setProp(entity.box, 'outlineColor', strokeProp)
    setProp(entity.box, 'outlineWidth', outlineWidth)
  }
  if (entity.ellipsoid) {
    setProp(entity.ellipsoid, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.ellipsoid, 'outline', outlineTrue)
    setProp(entity.ellipsoid, 'outlineColor', strokeProp)
    setProp(entity.ellipsoid, 'outlineWidth', outlineWidth)
  }
  if (entity.cylinder) {
    setProp(entity.cylinder, 'material', solidFillMat as unknown as ConstantProperty)
    setProp(entity.cylinder, 'outline', outlineTrue)
    setProp(entity.cylinder, 'outlineColor', strokeProp)
    setProp(entity.cylinder, 'outlineWidth', outlineWidth)
  }

  // Label — write or clear when labelField changes. v1's pattern: when a label
  // field is selected, render the attribute value as a Cesium label anchored
  // above/right of the geometry; clearing the field hides the label.
  if (style.labelField) {
    const raw = attributes?.[style.labelField]
    const labelText = raw == null ? '' : String(raw)
    const fontSize = style.labelSize ?? 12
    if (!entity.label) {
      // Lazy-create — only if a labelField is set, to avoid label noise.
      ;(entity as unknown as { label: unknown }).label = {
        text: labelText,
        font: `${fontSize}px sans-serif`,
        fillColor: stroke,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(8, -8),
      }
    } else {
      setProp(entity.label, 'text', new ConstantProperty(labelText))
      setProp(entity.label, 'font', new ConstantProperty(`${fontSize}px sans-serif`))
      setProp(entity.label, 'fillColor', new ConstantProperty(stroke))
    }
  } else if (entity.label) {
    setProp(entity.label, 'text', new ConstantProperty(''))
  }
}
