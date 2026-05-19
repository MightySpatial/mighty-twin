import { useEffect, useState, useRef } from 'react'
import { Cartographic, Cartesian3, Math as CesiumMathLib } from 'cesium'
import type { Viewer as CesiumViewer } from 'cesium'
import {
  loadHudConfig, evaluateSeverity, type HudConfig, type HudRow,
} from './hudConfig'
import type { NavigableSpace } from './types'

/** Per-layer source of features for the near-query. The host supplies
 *  this via the FeatureSource interface — Cesium-side layer state knows
 *  how to enumerate visible features. For v1 we accept a simple resolver. */
export interface FeatureSourceResolver {
  /** Returns features for a layer. The features must include a position
   *  (lon/lat/h) used for the near-query. Empty array if layer not loaded. */
  (layerId: string): Array<{
    id: string
    label: string
    /** [lon, lat, h] in degrees / meters. */
    position: [number, number, number]
    /** Feature attributes for display + severity rules. */
    properties: Record<string, unknown>
  }>
}

interface UseProbeHudOptions {
  viewer: CesiumViewer | null
  /** Active NavigableSpace — when null, HUD is dormant. */
  activeSpace: NavigableSpace | null
  /** Site slug for loading the per-site HUD config. */
  siteSlug: string | null
  /** Feature resolver injected by the host; if missing, HUD returns []. */
  featureSource?: FeatureSourceResolver
}

/** useProbeHud — runtime near-query during probe.
 *
 *  Samples the camera position at the configured rate. For each
 *  configured layer, returns the nearest N features within radius. The
 *  query is a brute-force O(N) per layer per sample — fine for typical
 *  layer sizes (< 10k features). For larger layers a quadtree cache
 *  ships in a follow-up.
 */
export function useProbeHud(opts: UseProbeHudOptions): { rows: HudRow[]; config: HudConfig | null } {
  const { viewer, activeSpace, siteSlug, featureSource } = opts
  const [config, setConfig] = useState<HudConfig | null>(null)
  const [rows, setRows] = useState<HudRow[]>([])
  const lastSampleAt = useRef(0)

  // Load + watch config
  useEffect(() => {
    if (!siteSlug) {
      setConfig(null)
      return
    }
    setConfig(loadHudConfig(siteSlug))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { siteSlug?: string } | undefined
      if (!detail?.siteSlug || detail.siteSlug === siteSlug) {
        setConfig(loadHudConfig(siteSlug))
      }
    }
    window.addEventListener('probe-hud-config-change', onChange)
    return () => window.removeEventListener('probe-hud-config-change', onChange)
  }, [siteSlug])

  // Near-query loop
  useEffect(() => {
    if (!viewer || !activeSpace || !config?.enabled || !featureSource) {
      setRows([])
      return
    }
    const interval = Math.max(50, Math.round(1000 / Math.max(1, config.sampleHz)))
    const id = window.setInterval(() => {
      const now = performance.now()
      if (now - lastSampleAt.current < interval - 10) return
      lastSampleAt.current = now
      if (viewer.isDestroyed()) return

      let cameraLonLatH: [number, number, number]
      try {
        const carto = Cartographic.fromCartesian(viewer.camera.position)
        cameraLonLatH = [
          CesiumMathLib.toDegrees(carto.longitude),
          CesiumMathLib.toDegrees(carto.latitude),
          carto.height,
        ]
      } catch {
        return
      }

      const camPos = Cartesian3.fromDegrees(...cameraLonLatH)
      const aggregated: HudRow[] = []

      for (const layerCfg of config.layers) {
        const features = featureSource(layerCfg.layerId)
        if (!features || features.length === 0) continue
        const scored: Array<{ row: HudRow; dist: number }> = []
        for (const f of features) {
          const fPos = Cartesian3.fromDegrees(f.position[0], f.position[1], f.position[2])
          const dist = Cartesian3.distance(camPos, fPos)
          if (dist > layerCfg.radiusM) continue
          const severity = evaluateSeverity(f.properties, layerCfg.severityRules)
          scored.push({
            dist,
            row: {
              layerId: layerCfg.layerId,
              layerLabel: layerCfg.label,
              featureId: f.id,
              featureLabel: f.label,
              distanceM: dist,
              fields: layerCfg.displayFields.map((fld) => ({
                label: fld.label,
                value: formatValue(f.properties[fld.key], fld.unit),
                unit: fld.unit,
              })),
              severity,
            },
          })
        }
        scored.sort((a, b) => a.dist - b.dist)
        for (const s of scored.slice(0, config.maxRowsPerLayer)) aggregated.push(s.row)
      }

      setRows(aggregated)
    }, interval)

    return () => window.clearInterval(id)
  }, [viewer, activeSpace, config, featureSource])

  return { rows, config }
}

function formatValue(v: unknown, unit?: string): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') {
    const fixed = v.toFixed(Math.abs(v) > 100 ? 0 : 2)
    return unit ? `${fixed} ${unit}` : fixed
  }
  const s = String(v)
  return unit ? `${s} ${unit}` : s
}
