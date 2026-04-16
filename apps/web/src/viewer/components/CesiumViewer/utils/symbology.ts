import { Color } from 'cesium'
import type { Layer } from '../types'

export function getSymbologyColor(layer: Layer, feature?: Record<string, unknown>): { stroke: Color; fill: Color; width: number } {
  const sym = layer.style
  const opacity = layer.opacity ?? 1

  if (sym?.renderType === 'categorized' && sym.categorized && feature) {
    const field = sym.categorized.field
    const value = feature[field]
    const cat = sym.categorized.categories?.find(c => c.value == value)
    const hex = cat?.color ?? sym.categorized.default ?? '#6366f1'
    const c = Color.fromCssColorString(hex)
    return { stroke: c.withAlpha(opacity), fill: c.withAlpha(opacity * 0.35), width: 2 }
  }

  const hex = sym?.single?.strokeColor ?? sym?.color ?? '#6366f1'
  const c = Color.fromCssColorString(hex)
  const fillHex = sym?.single?.fillColor ?? hex
  const fc = Color.fromCssColorString(fillHex)
  return {
    stroke: c.withAlpha(opacity),
    fill: fc.withAlpha((sym?.single?.opacity ?? opacity) * 0.35),
    width: sym?.single?.lineWidth ?? 2,
  }
}
