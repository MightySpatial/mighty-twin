/**
 * MightyTwin — Design Download Panel (faithful port of v1 DownloadTab "Export
 * Geometry" section).
 *
 * v1 layout:
 *   • Format dropdown: GeoJSON / Shapefile / KML / DXF / GeoPackage / CSV /
 *     IFC (BIM)
 *   • CRS dropdown: WGS84 (4326) + projected options
 *   • Sketch scope dropdown: All sketches / single sketch
 *   • Split mode dropdown: No split / By layer / By attribute (+ split-attr
 *     input when 'attribute' is selected)
 *   • Export button
 *
 * v2 backend gap: Shapefile, KML, DXF, GeoPackage, IFC need a server-side
 * export service that the v2 backend doesn't yet expose. Those formats are
 * present in the dropdown — matching v1's surface — but disabled with a
 * server-required hint so the user sees the same shape and can request the
 * service. GeoJSON, CSV (WKT), and JSON-state work entirely client-side.
 */

import { useMemo, useState } from 'react'
import { Download, Loader, AlertCircle } from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { serializeSketchLayers, type GeoJSONFeature } from '../serializeFeatures'

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

type ExportFormat = 'geojson' | 'shapefile' | 'kml' | 'dxf' | 'geopackage' | 'csv' | 'ifc' | 'json_state'
type SplitMode = 'none' | 'layer' | 'attribute'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  geojson: 'GeoJSON',
  shapefile: 'Shapefile',
  kml: 'KML',
  dxf: 'DXF',
  geopackage: 'GeoPackage',
  csv: 'CSV',
  ifc: 'IFC (BIM)',
  json_state: 'Design state · JSON',
}

/** Backend-required formats — surfaced in the dropdown for parity with v1
 *  but disabled until a v2 export service ships. */
const BACKEND_REQUIRED: ReadonlySet<ExportFormat> = new Set(['shapefile', 'kml', 'dxf', 'geopackage', 'ifc'])

const CRS_OPTIONS: { epsg: number; name: string }[] = [
  { epsg: 4326, name: 'WGS 84 (EPSG:4326)' },
  { epsg: 3857, name: 'Web Mercator (EPSG:3857)' },
  { epsg: 7855, name: 'GDA2020 / MGA Zone 55 (EPSG:7855)' },
  { epsg: 7856, name: 'GDA2020 / MGA Zone 56 (EPSG:7856)' },
]

export default function DownloadPanel({ viewer, layers, features }: Props) {
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [crs, setCrs] = useState<number>(4326)
  const [sketchScope, setSketchScope] = useState<string>('__all__')
  const [splitMode, setSplitMode] = useState<SplitMode>('none')
  const [splitAttr, setSplitAttr] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const visibleLayers = layers.filter((l) => l.visible)
    const visibleFeatureIds = new Set<string>()
    for (const f of features) {
      const layer = visibleLayers.find((l) => l.id === f.layerId)
      if (layer) visibleFeatureIds.add(f.id)
    }
    return {
      visibleLayers,
      featureCount: visibleFeatureIds.size,
      totalLayers: layers.length,
      totalFeatures: features.length,
    }
  }, [layers, features])

  const isBackendBlocked = BACKEND_REQUIRED.has(format)

  function trigger(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
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

  /** GeoJSON FeatureCollection → CSV with WKT geometry column. v1 parity. */
  function geojsonToCsv(gjFeatures: GeoJSONFeature[]): string {
    const allKeys = new Set<string>()
    for (const f of gjFeatures) {
      for (const k of Object.keys(f.properties ?? {})) {
        if (k !== '_design') allKeys.add(k)
      }
    }
    const cols = ['id', 'geometry_wkt', ...allKeys]
    const lines = [cols.join(',')]
    for (const f of gjFeatures) {
      const props = f.properties ?? {}
      const wkt = geomToWkt(f.geometry)
      const row = [
        csvCell(f.id),
        csvCell(wkt),
        ...[...allKeys].map(k => csvCell(props[k])),
      ]
      lines.push(row.join(','))
    }
    return lines.join('\n')
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      if (isBackendBlocked) {
        throw new Error(`${FORMAT_LABELS[format]} export needs the server-side export service (not yet wired up in v2). Use GeoJSON or CSV for now.`)
      }

      // JSON state — full Twin round-trip dump. CRS/scope/split don't apply.
      if (format === 'json_state') {
        const payload = { schema: 1, exported_at: new Date().toISOString(), layers, features }
        trigger(`mighty-twin-design-state-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json')
        return
      }

      const { features: gjFeatures, skipped } = geoJsonForScope()
      if (gjFeatures.length === 0) {
        throw new Error(skipped > 0
          ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
          : 'No features to download in scope.')
      }

      // CRS warning — v2 reprojects only on the server; client GeoJSON is
      // always WGS84. v1 lets the user pick a target CRS but the client
      // export ships in 4326 + a property tagging the requested CRS so a
      // downstream tool can reproject deterministically.
      if (crs !== 4326) {
        gjFeatures.forEach(f => {
          f.properties = { ...f.properties, _crs_requested: crs }
        })
      }

      const splitGroups = splitFeatures(gjFeatures, splitMode, splitAttr)

      if (format === 'geojson') {
        if (splitGroups.length === 1) {
          const [{ key, items }] = splitGroups
          const filename = `${key || 'sketch'}-${stamp}.geojson`
          trigger(
            filename,
            JSON.stringify({ type: 'FeatureCollection', features: items }, null, 2),
            'application/geo+json',
          )
        } else {
          for (const { key, items } of splitGroups) {
            if (items.length === 0) continue
            trigger(
              `${slugify(key)}-${stamp}.geojson`,
              JSON.stringify({ type: 'FeatureCollection', features: items }, null, 2),
              'application/geo+json',
            )
          }
        }
        return
      }

      if (format === 'csv') {
        if (splitGroups.length === 1) {
          trigger(`mighty-twin-design-${stamp}.csv`, geojsonToCsv(splitGroups[0].items), 'text/csv')
        } else {
          for (const { key, items } of splitGroups) {
            if (items.length === 0) continue
            trigger(`${slugify(key)}-${stamp}.csv`, geojsonToCsv(items), 'text/csv')
          }
        }
        return
      }

      throw new Error(`Format "${format}" is not implemented client-side.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="dl-panel">
      {/* Summary banner */}
      <div className="dl-summary">
        <Download size={16} className="dl-summary-icon" />
        <div>
          <div className="dl-summary-count">
            {summary.featureCount} feature{summary.featureCount === 1 ? '' : 's'} ready
          </div>
          <div className="dl-summary-meta">
            From {summary.visibleLayers.length} visible / {summary.totalLayers} total layer{summary.totalLayers === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="dl-section-label">Export Geometry</div>

      {/* Format + CRS row */}
      <div className="dl-row">
        <select
          className="dl-select"
          value={format}
          onChange={e => setFormat(e.target.value as ExportFormat)}
          title="Format"
        >
          <optgroup label="Client-side">
            <option value="geojson">{FORMAT_LABELS.geojson}</option>
            <option value="csv">{FORMAT_LABELS.csv}</option>
            <option value="json_state">{FORMAT_LABELS.json_state}</option>
          </optgroup>
          <optgroup label="Needs export service">
            <option value="shapefile">{FORMAT_LABELS.shapefile}</option>
            <option value="kml">{FORMAT_LABELS.kml}</option>
            <option value="dxf">{FORMAT_LABELS.dxf}</option>
            <option value="geopackage">{FORMAT_LABELS.geopackage}</option>
            <option value="ifc">{FORMAT_LABELS.ifc}</option>
          </optgroup>
        </select>
        <select
          className="dl-select"
          value={crs}
          onChange={e => setCrs(Number(e.target.value))}
          title="CRS"
          disabled={format === 'json_state'}
        >
          {CRS_OPTIONS.map(o => (
            <option key={o.epsg} value={o.epsg}>{o.name}</option>
          ))}
        </select>
      </div>

      {/* Scope + Split row */}
      <div className="dl-row">
        <select
          className="dl-select"
          value={sketchScope}
          onChange={e => setSketchScope(e.target.value)}
          title="Scope"
          disabled={format === 'json_state'}
        >
          <option value="__all__">All visible</option>
          {layers.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className="dl-select"
          value={splitMode}
          onChange={e => setSplitMode(e.target.value as SplitMode)}
          title="Split mode"
          disabled={format === 'json_state' || format === 'csv' && splitMode === 'attribute'}
        >
          <option value="none">No split</option>
          <option value="layer">By layer</option>
          <option value="attribute">By attribute</option>
        </select>
      </div>

      {splitMode === 'attribute' && (
        <input
          className="dl-input"
          type="text"
          placeholder="Attribute name to split on"
          value={splitAttr}
          onChange={e => setSplitAttr(e.target.value)}
        />
      )}

      {isBackendBlocked && (
        <div className="dl-warning">
          <AlertCircle size={12} />
          <span>{FORMAT_LABELS[format]} export needs the server-side export service (not yet wired up in v2).</span>
        </div>
      )}

      {error && (
        <div className="dl-error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="dl-export-btn"
        onClick={download}
        disabled={downloading || summary.featureCount === 0 || isBackendBlocked}
      >
        {downloading ? (<><Loader size={12} className="spin" /> Exporting…</>) : (<>↓ Export</>)}
      </button>
    </div>
  )
}

function splitFeatures(
  fs: GeoJSONFeature[],
  mode: SplitMode,
  attr: string,
): { key: string; items: GeoJSONFeature[] }[] {
  if (mode === 'none') return [{ key: 'mighty-twin-design', items: fs }]
  if (mode === 'layer') {
    const byLayer = new Map<string, GeoJSONFeature[]>()
    for (const f of fs) {
      const lid = (f.properties?._design as { layer_id?: string } | undefined)?.layer_id ?? 'unknown'
      if (!byLayer.has(lid)) byLayer.set(lid, [])
      byLayer.get(lid)!.push(f)
    }
    return Array.from(byLayer.entries()).map(([k, v]) => ({ key: k, items: v }))
  }
  // by attribute
  const key = attr.trim()
  if (!key) return [{ key: 'mighty-twin-design', items: fs }]
  const groups = new Map<string, GeoJSONFeature[]>()
  for (const f of fs) {
    const v = (f.properties as Record<string, unknown>)?.[key]
    const k = v == null ? '__null__' : String(v)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(f)
  }
  return Array.from(groups.entries()).map(([k, v]) => ({ key: `${key}-${k}`, items: v }))
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function geomToWkt(g: GeoJSONFeature['geometry']): string {
  const fmt = (c: readonly [number, number, number?] | number[]): string => {
    const z = c[2]
    return `${c[0]} ${c[1]}${z != null ? ' ' + z : ''}`
  }
  switch (g.type) {
    case 'Point': return `POINT(${fmt(g.coordinates)})`
    case 'LineString': return `LINESTRING(${g.coordinates.map(fmt).join(', ')})`
    case 'Polygon': return `POLYGON((${g.coordinates[0].map(fmt).join(', ')}))`
    default: return ''
  }
}

function slugify(s: string): string {
  return (s || 'sketch').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sketch'
}
