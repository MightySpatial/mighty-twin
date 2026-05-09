/** Split a flat GeoJSON feature list into named groups. Mirrors v1's
 *  unifiedExportSplit modes: 'none' / 'layer' / 'attribute'. */
import type { GeoJSONFeature } from '../../serializeFeatures'

export type SplitMode = 'none' | 'layer' | 'attribute'

export interface SplitGroup {
  key: string
  items: GeoJSONFeature[]
}

export function splitFeatures(
  features: GeoJSONFeature[],
  mode: SplitMode,
  attr: string,
): SplitGroup[] {
  if (mode === 'none') {
    return [{ key: 'mighty-twin-design', items: features }]
  }
  if (mode === 'layer') {
    const byLayer = new Map<string, GeoJSONFeature[]>()
    for (const f of features) {
      const lid = (f.properties?._design as { layer_id?: string } | undefined)?.layer_id ?? 'unknown'
      if (!byLayer.has(lid)) byLayer.set(lid, [])
      byLayer.get(lid)!.push(f)
    }
    return Array.from(byLayer.entries()).map(([k, v]) => ({ key: k, items: v }))
  }
  // mode === 'attribute'
  const key = attr.trim()
  if (!key) return [{ key: 'mighty-twin-design', items: features }]
  const groups = new Map<string, GeoJSONFeature[]>()
  for (const f of features) {
    const v = (f.properties as Record<string, unknown>)?.[key]
    const k = v == null ? '__null__' : String(v)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(f)
  }
  return Array.from(groups.entries()).map(([k, v]) => ({ key: `${key}-${k}`, items: v }))
}

export function slugifySplitKey(s: string): string {
  return (s || 'sketch').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sketch'
}
