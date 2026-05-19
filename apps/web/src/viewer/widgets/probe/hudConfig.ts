/** Probe HUD — per-layer near-analysis configuration.
 *
 *  v1 stores config in localStorage scoped per site. Atlas admin will
 *  surface a config UI in a follow-up; for now the schema is hand-set
 *  via the Probe settings panel or directly through localStorage.
 *
 *  When probe is active and a config exists, useProbeHud samples camera
 *  position at the configured rate, queries each layer's features for
 *  the nearest within `radiusM`, and surfaces them in a side strip
 *  with distance + display fields + severity badge.
 */

export type Severity = 'normal' | 'warn' | 'alert'

export interface HudLayerConfig {
  /** Layer id (matches the existing per-site layer registry). */
  layerId: string
  /** Display label shown above this layer's HUD rows. */
  label: string
  /** Search radius (m) for the near-query. */
  radiusM: number
  /** Feature fields surfaced as columns in each HUD row. */
  displayFields: Array<{
    /** Field key on the feature's properties object. */
    key: string
    /** Display label for the field. */
    label: string
    /** Optional unit suffix (m, mm, °C, etc.). */
    unit?: string
  }>
  /** Optional severity rules — first matching rule wins, evaluated in order. */
  severityRules?: Array<{
    field: string
    op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq'
    value: string | number
    severity: Severity
  }>
}

export interface HudConfig {
  /** Layers to query during probe. */
  layers: HudLayerConfig[]
  /** Sample rate (Hz). Default 10 = 100ms cadence. Lower for performance. */
  sampleHz: number
  /** Max rows per layer in the HUD strip. */
  maxRowsPerLayer: number
  /** Master toggle (admin can disable HUD per-site without losing config). */
  enabled: boolean
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: false,
  layers: [],
  sampleHz: 10,
  maxRowsPerLayer: 5,
}

const STORAGE_KEY = (siteSlug: string) => `mighty:probe:hud-config:${siteSlug}`

export function loadHudConfig(siteSlug: string): HudConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(siteSlug))
    if (!raw) return DEFAULT_HUD_CONFIG
    const parsed = JSON.parse(raw) as Partial<HudConfig>
    return { ...DEFAULT_HUD_CONFIG, ...parsed }
  } catch {
    return DEFAULT_HUD_CONFIG
  }
}

export function saveHudConfig(siteSlug: string, config: HudConfig) {
  try {
    localStorage.setItem(STORAGE_KEY(siteSlug), JSON.stringify(config))
    window.dispatchEvent(new CustomEvent('probe-hud-config-change', { detail: { siteSlug } }))
  } catch {
    /* storage disabled or quota */
  }
}

/** A near-query result row. */
export interface HudRow {
  layerId: string
  layerLabel: string
  featureId: string
  featureLabel: string
  distanceM: number
  fields: Array<{ label: string; value: string; unit?: string }>
  severity: Severity
}

/** Evaluate severity rules against a feature's properties. */
export function evaluateSeverity(
  properties: Record<string, unknown>,
  rules: HudLayerConfig['severityRules'],
): Severity {
  if (!rules) return 'normal'
  for (const rule of rules) {
    const val = properties[rule.field]
    if (val === undefined) continue
    const num = typeof val === 'number' ? val : Number(val)
    const target = typeof rule.value === 'number' ? rule.value : Number(rule.value)
    const isNumeric = !Number.isNaN(num) && !Number.isNaN(target)
    let hit = false
    if (isNumeric) {
      if (rule.op === 'lt') hit = num < target
      else if (rule.op === 'lte') hit = num <= target
      else if (rule.op === 'gt') hit = num > target
      else if (rule.op === 'gte') hit = num >= target
      else if (rule.op === 'eq') hit = num === target
      else if (rule.op === 'neq') hit = num !== target
    } else {
      // String comparison for non-numeric fields
      const s = String(val)
      const t = String(rule.value)
      if (rule.op === 'eq') hit = s === t
      else if (rule.op === 'neq') hit = s !== t
    }
    if (hit) return rule.severity
  }
  return 'normal'
}
