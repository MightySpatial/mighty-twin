/** Download Panel state + side-effects.
 *
 * Client-side formats (GeoJSON, CSV, JSON-state) run in-browser. Server-side
 * formats (Shapefile, KML, GeoPackage, DXF) POST the GeoJSON payload to
 * `/api/design/export` — see `apps/api/src/twin_api/design_export_routes.py`. */
import { useEffect, useMemo, useState } from 'react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../../types'
import { serializeSketchLayers, type GeoJSONFeature } from '../../serializeFeatures'
import { geojsonToCsv } from './csv'
import { splitFeatures, slugifySplitKey, type SplitMode } from './split'
import { FORMAT_BY_ID, type ExportFormat } from './formats'

const API_URL = import.meta.env.VITE_API_URL || ''

export interface UseDownloadArgs {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

interface CrsOption { epsg: number; name: string }

export function useDownload({ viewer, layers, features }: UseDownloadArgs) {
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [crs, setCrs] = useState<number>(4326)
  const [sketchScope, setSketchScope] = useState<string>('__all__')
  const [splitMode, setSplitMode] = useState<SplitMode>('none')
  const [splitAttr, setSplitAttr] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crsOptions, setCrsOptions] = useState<CrsOption[]>([])

  // ── Fetch the canonical CRS catalogue from the server. Falls back to
  // a sane builtin set if the request fails (offline dev, auth error).
  useEffect(() => {
    let cancelled = false
    const builtin: CrsOption[] = [
      { epsg: 4326, name: 'WGS 84 (EPSG:4326)' },
      { epsg: 3857, name: 'Web Mercator (EPSG:3857)' },
      { epsg: 7855, name: 'GDA2020 / MGA Zone 55 (EPSG:7855)' },
      { epsg: 7856, name: 'GDA2020 / MGA Zone 56 (EPSG:7856)' },
    ]
    fetch(`${API_URL}/api/design/export/crs-options`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(data => {
        if (cancelled) return
        const presets = (data?.presets as CrsOption[]) ?? builtin
        setCrsOptions(presets.length ? presets : builtin)
      })
      .catch(() => { if (!cancelled) setCrsOptions(builtin) })
    return () => { cancelled = true }
  }, [])

  const summary = useMemo(() => {
    const visibleLayers = layers.filter(l => l.visible)
    const visibleIds = new Set<string>()
    for (const f of features) {
      if (visibleLayers.some(l => l.id === f.layerId)) visibleIds.add(f.id)
    }
    return {
      visibleLayers,
      featureCount: visibleIds.size,
      totalLayers: layers.length,
      totalFeatures: features.length,
    }
  }, [layers, features])

  const formatSpec = FORMAT_BY_ID[format]

  function trigger(filename: string, content: string | Blob, mime: string) {
    const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function geoJsonForScope(): { features: GeoJSONFeature[]; skipped: number } {
    const inScope = sketchScope === '__all__'
      ? features
      : features.filter(f => f.layerId === sketchScope)
    return serializeSketchLayers(layers, inScope, viewer)
  }

  async function postServerExport(
    fc: { type: 'FeatureCollection'; features: GeoJSONFeature[] },
    targetFormat: ExportFormat,
    targetEpsg: number,
    filename: string,
  ): Promise<{ blob: Blob; ext: string }> {
    const token = localStorage.getItem('accessToken')
    const res = await fetch(`${API_URL}/api/design/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        feature_collection: fc,
        format: targetFormat,
        target_epsg: targetEpsg,
        filename,
      }),
    })
    if (!res.ok) {
      let msg = `Export failed (${res.status})`
      try {
        const data = await res.json()
        if (data?.detail) msg = String(data.detail)
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    // Server picks the extension via Content-Disposition; sniff it for our trigger().
    const cd = res.headers.get('Content-Disposition') || ''
    const m = cd.match(/filename="?([^"]+)"?/i)
    const fname = m ? m[1] : `${filename}.${targetFormat}`
    const dotIx = fname.lastIndexOf('.')
    const ext = dotIx >= 0 ? fname.slice(dotIx + 1) : targetFormat
    return { blob: await res.blob(), ext }
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      // JSON-state — Twin internal round-trip. CRS / scope / split don't apply.
      if (format === 'json_state') {
        const payload = { schema: 1, exported_at: new Date().toISOString(), layers, features }
        trigger(
          `mighty-twin-design-state-${stamp}.json`,
          JSON.stringify(payload, null, 2),
          'application/json',
        )
        return
      }

      const { features: gjFeatures, skipped } = geoJsonForScope()
      if (gjFeatures.length === 0) {
        throw new Error(skipped > 0
          ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
          : 'No features to download in scope.')
      }

      const splitGroups = splitFeatures(gjFeatures, splitMode, splitAttr)

      for (const { key, items } of splitGroups) {
        if (items.length === 0) continue
        const baseName = splitGroups.length === 1
          ? `mighty-twin-design-${stamp}`
          : `${slugifySplitKey(key)}-${stamp}`

        if (format === 'geojson') {
          // Pure-client GeoJSON when CRS is 4326; server reproject otherwise.
          if (crs === 4326) {
            trigger(
              `${baseName}.geojson`,
              JSON.stringify({ type: 'FeatureCollection', features: items }, null, 2),
              'application/geo+json',
            )
          } else {
            const { blob, ext } = await postServerExport(
              { type: 'FeatureCollection', features: items }, 'geojson', crs, baseName,
            )
            trigger(`${baseName}.${ext}`, blob, blob.type || 'application/geo+json')
          }
          continue
        }

        if (format === 'csv') {
          if (crs === 4326) {
            trigger(`${baseName}.csv`, geojsonToCsv(items), 'text/csv')
          } else {
            const { blob, ext } = await postServerExport(
              { type: 'FeatureCollection', features: items }, 'csv', crs, baseName,
            )
            trigger(`${baseName}.${ext}`, blob, blob.type || 'text/csv')
          }
          continue
        }

        // Server formats: Shapefile, KML, GeoPackage, DXF.
        const { blob, ext } = await postServerExport(
          { type: 'FeatureCollection', features: items }, format, crs, baseName,
        )
        trigger(`${baseName}.${ext}`, blob, blob.type || 'application/octet-stream')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return {
    // selection
    format, setFormat,
    crs, setCrs,
    sketchScope, setSketchScope,
    splitMode, setSplitMode,
    splitAttr, setSplitAttr,
    crsOptions,
    // derived
    summary,
    formatSpec,
    // actions
    downloading,
    error,
    download,
  }
}
