/** Pure helpers for grouping features in the History panel. */
import type { SketchFeature } from '../../types'

export type GeomKind = 'point' | 'line' | 'polygon' | 'solid' | 'other'

export const GEOM_KIND: Record<string, GeomKind> = {
  point: 'point',
  line: 'line',
  traverse: 'line',
  polygon: 'polygon',
  rectangle: 'polygon',
  circle: 'polygon',
  box: 'solid',
  pit: 'solid',
  cylinder: 'solid',
}

export const GEOM_GROUP_LABELS: Record<GeomKind, string> = {
  point: 'Points',
  line: 'Lines',
  polygon: 'Polygons',
  solid: 'Solids',
  other: 'Other',
}

export const GEOM_KIND_ORDER: GeomKind[] = ['point', 'line', 'polygon', 'solid', 'other']

export const GEOM_ICONS: Record<string, string> = {
  point: '●', line: '╱', polygon: '⬡', rectangle: '▣', circle: '◯',
  traverse: '⟡', box: '⬒', pit: '⊟', cylinder: '⊙', other: '◇',
}

export function bucketFeaturesByGeomKind(features: SketchFeature[]): Record<GeomKind, SketchFeature[]> {
  const out: Record<GeomKind, SketchFeature[]> = { point: [], line: [], polygon: [], solid: [], other: [] }
  for (const f of features) {
    const kind = GEOM_KIND[f.geometry] ?? 'other'
    out[kind].push(f)
  }
  return out
}
