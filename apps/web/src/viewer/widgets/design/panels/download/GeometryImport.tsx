/**
 * GeometryImport — file picker → POST /api/design/import → preview →
 * commit-as-nodes.
 *
 * Backend handles GeoJSON / KML / KMZ / Shapefile zip / GPKG / DXF /
 * CSV+TSV (lon/lat auto-detect). Returns features in WGS84. We display
 * a tiny preview (count + geometry breakdown + field list) and let the
 * user commit — each feature becomes a node in the active sketch.
 *
 * Spec V1_SPEC.md §7 import side.
 */
import { useRef, useState } from 'react'
import { Loader, Upload, AlertCircle, Check } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import { generateNodeId } from '../../sketch/dagOps'
import type { GeometryKind, Position, SketchNode } from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface ParsedFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown> | null
}

interface ImportPreview {
  filename: string
  extension: string
  crs_detected: string
  crs_epsg: number | null
  feature_count: number
  geometry_counts: Record<string, number>
  field_schema: string[]
  features: ParsedFeature[]
}

const ACCEPT = '.geojson,.json,.kml,.kmz,.zip,.gpkg,.dxf,.csv,.tsv'

export default function GeometryImport() {
  const sketches = useCadEngine(s => s.sketches)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const addNode = useCadEngine(s => s.addNode)

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [committedCount, setCommittedCount] = useState<number | null>(null)

  async function handleUpload(file: File) {
    setBusy(true)
    setError(null)
    setPreview(null)
    setCommittedCount(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('accessToken')
      const r = await fetch(`${API_URL}/api/design/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({} as { detail?: string }))
        throw new Error(detail.detail || `Import failed (${r.status})`)
      }
      const data = (await r.json()) as ImportPreview
      setPreview(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function handleCommit() {
    if (!preview || !activeSketchId) return
    const sketch = sketches[activeSketchId]
    if (!sketch) return

    let added = 0
    for (const f of preview.features) {
      const node = featureToNode(f, activeSketchId, activeLayerId ?? sketch.activeLayerId)
      if (!node) continue
      try {
        addNode(node)
        added += 1
      } catch {
        // Duplicate id or invalid — skip silently and report total at end.
      }
    }
    setCommittedCount(added)
  }

  function reset() {
    setPreview(null)
    setError(null)
    setCommittedCount(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="gi-panel">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleUpload(f)
        }}
      />

      {!preview && (
        <button
          type="button"
          className="dl-export-btn"
          disabled={busy || !activeSketchId}
          onClick={() => fileRef.current?.click()}
          style={{ background: 'var(--dw-fill-2)', color: 'var(--dw-text-1)' }}
        >
          {busy
            ? <><Loader size={14} className="spin" /> Parsing…</>
            : <><Upload size={14} /> Choose file…</>}
        </button>
      )}

      <p className="gi-hint">GeoJSON · KML · KMZ · SHP zip · GPKG · DXF · CSV / TSV</p>

      {error && <div className="dl-error"><AlertCircle size={12} /><span>{error}</span></div>}

      {preview && committedCount === null && (
        <div className="gi-preview">
          <div className="gi-preview-row">
            <span className="gi-preview-key">File</span>
            <span className="gi-preview-val">{preview.filename}</span>
          </div>
          <div className="gi-preview-row">
            <span className="gi-preview-key">CRS</span>
            <span className="gi-preview-val">{preview.crs_detected}</span>
          </div>
          <div className="gi-preview-row">
            <span className="gi-preview-key">Features</span>
            <span className="gi-preview-val">{preview.feature_count}</span>
          </div>
          {Object.keys(preview.geometry_counts).length > 0 && (
            <div className="gi-preview-row">
              <span className="gi-preview-key">Types</span>
              <span className="gi-preview-val">
                {Object.entries(preview.geometry_counts).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </span>
            </div>
          )}
          {preview.field_schema.length > 0 && (
            <div className="gi-preview-row">
              <span className="gi-preview-key">Fields</span>
              <span className="gi-preview-val">{preview.field_schema.slice(0, 6).join(', ')}{preview.field_schema.length > 6 ? '…' : ''}</span>
            </div>
          )}
          <div className="dl-row">
            <button
              type="button"
              className="dl-export-btn"
              disabled={busy || !activeSketchId || preview.feature_count === 0}
              onClick={handleCommit}
            >
              <Check size={14} /> Add {preview.feature_count} feature{preview.feature_count === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              className="dl-export-btn"
              onClick={reset}
              style={{ background: 'var(--dw-fill-2)', color: 'var(--dw-text-2)' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {committedCount !== null && (
        <div className="gi-committed">
          <Check size={14} /> Imported {committedCount} feature{committedCount === 1 ? '' : 's'}.
          <button type="button" className="gi-link" onClick={reset}>Import another</button>
        </div>
      )}
    </div>
  )
}

// ── Feature → node ────────────────────────────────────────────────────────

function featureToNode(
  f: ParsedFeature,
  sketchId: string,
  layerId: string,
): SketchNode | null {
  const geom = f.geometry
  if (!geom || !geom.type) return null
  const positions = coordsToPositions(geom.type, geom.coordinates)
  if (!positions || positions.length === 0) return null
  const kind = mapGeometryKind(geom.type)
  if (!kind) return null

  const props = (f.properties ?? {}) as Record<string, unknown>
  const name = (props.name ?? props.Name ?? props.title ?? props.id) as string | undefined

  return {
    id: generateNodeId(),
    type: 'sketch',
    inputs: [],
    template_id: null,
    params: {
      geometry: kind,
      positions,
      sketchId,
      sketchLayer: layerId,
    },
    attributes: name ? { name, ...props } : { ...props },
    style: {
      color: '#22d3ee',
      fillColor: '#22d3ee',
      opacity: 0.7,
      lineWidth: kind === 'line' ? 3 : undefined,
      pointSize: kind === 'point' ? 12 : undefined,
    },
  }
}

function mapGeometryKind(geomType: string): GeometryKind | null {
  switch (geomType) {
    case 'Point':
    case 'MultiPoint':
      return 'point'
    case 'LineString':
    case 'MultiLineString':
      return 'line'
    case 'Polygon':
    case 'MultiPolygon':
      return 'polygon'
    default:
      return null
  }
}

/** Flatten GeoJSON coordinate arrays into the engine's `positions[]`
 *  shape ([lon,lat,alt?][]). For Multi* and Polygon rings we take the
 *  first ring / first sub-geometry — round-tripping multi-part features
 *  to multi-node groups is a Phase 6 follow-up. */
function coordsToPositions(geomType: string, coords: unknown): Position[] | null {
  if (!Array.isArray(coords)) return null
  switch (geomType) {
    case 'Point':
      return isCoord(coords) ? [coordToPosition(coords)] : null
    case 'MultiPoint':
    case 'LineString':
      return coords.filter(isCoord).map(coordToPosition)
    case 'MultiLineString':
    case 'Polygon': {
      const ring = coords[0]
      if (!Array.isArray(ring)) return null
      return ring.filter(isCoord).map(coordToPosition)
    }
    case 'MultiPolygon': {
      const poly = coords[0]
      if (!Array.isArray(poly)) return null
      const ring = poly[0]
      if (!Array.isArray(ring)) return null
      return ring.filter(isCoord).map(coordToPosition)
    }
    default:
      return null
  }
}

function isCoord(v: unknown): v is number[] {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
}

function coordToPosition(c: number[]): Position {
  if (c.length >= 3 && typeof c[2] === 'number') return [c[0], c[1], c[2]]
  return [c[0], c[1]]
}
