/**
 * GeometryImport — file picker that parses GeoJSON / KML / CSV (lat/lon)
 * via /api/design/import and creates a node per parsed feature in the
 * active sketch.
 *
 *   Two-step UX:
 *     1. User picks a file → POST to /api/design/import → server parses,
 *        returns FeatureCollection + CRS + field summary.
 *     2. Preview card shows what was found (count, geometry kinds,
 *        fields). User clicks Import to commit; Cancel discards the
 *        preview.
 */
import { useRef, useState } from 'react'
import { Upload, FileText, Loader, AlertCircle, X } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import { generateNodeId } from '../sketch/dagOps'
import type { GeometryKind, NodeType, Position, SketchNode } from '../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

const ACCEPTED = '.geojson,.json,.kml,.kmz,.csv,.tsv,.shp,.zip,.gpkg,.dxf'

interface ParsedGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | string
  coordinates: unknown
}

interface ParsedFeature {
  type: 'Feature'
  geometry: ParsedGeometry | null
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

export default function GeometryImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const addNode = useCadEngine(s => s.addNode)

  async function pickFile(file: File) {
    setBusy(true)
    setError(null)
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
      const data = await r.json() as ImportPreview
      setPreview(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function commit() {
    if (!preview || !activeSketchId || !activeLayerId) return
    let added = 0
    for (const f of preview.features) {
      const node = featureToNode(f, activeSketchId, activeLayerId)
      if (!node) continue
      addNode(node)
      added++
    }
    setPreview(null)
    setError(added === 0
      ? 'No supported geometries imported (Point / LineString / Polygon only).'
      : null)
  }

  function reset() {
    setPreview(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const noContext = !activeSketchId || !activeLayerId

  return (
    <div className="dl-section">
      <div className="dl-section-label">Import Geometry</div>

      {!preview && (
        <>
          <button
            type="button"
            className="gi-drop"
            onClick={() => fileRef.current?.click()}
            disabled={busy || noContext}
            title={noContext ? 'Pick a sketch and layer first' : 'Choose a file to import'}
          >
            {busy ? (
              <>
                <Loader size={18} className="spin" />
                <span>Parsing…</span>
              </>
            ) : (
              <>
                <Upload size={18} />
                <span>Choose file</span>
                <span className="gi-drop__hint">GeoJSON · KML · CSV · Shapefile · GPKG · DXF</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
            }}
          />
        </>
      )}

      {preview && (
        <div className="gi-preview">
          <div className="gi-preview__hd">
            <FileText size={14} />
            <span className="gi-preview__name">{preview.filename}</span>
            <button
              type="button"
              className="gi-preview__close"
              onClick={reset}
              title="Discard preview"
            >
              <X size={12} />
            </button>
          </div>
          <ul className="gi-preview__rows">
            <li>
              <span>CRS</span>
              <b>{preview.crs_detected}{preview.crs_epsg ? ` · EPSG:${preview.crs_epsg}` : ''}</b>
            </li>
            <li>
              <span>Features</span>
              <b>{preview.feature_count}</b>
            </li>
            <li>
              <span>Geometry</span>
              <b>
                {Object.entries(preview.geometry_counts)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(' · ') || '—'}
              </b>
            </li>
            {preview.field_schema.length > 0 && (
              <li>
                <span>Fields</span>
                <b className="gi-preview__fields">
                  {preview.field_schema.slice(0, 6).join(', ')}
                  {preview.field_schema.length > 6 && ` +${preview.field_schema.length - 6}`}
                </b>
              </li>
            )}
          </ul>
          <div className="gi-preview__actions">
            <button type="button" className="ae-save-cancel" onClick={reset}>Cancel</button>
            <button
              type="button"
              className="dl-export-btn"
              onClick={commit}
              disabled={noContext}
            >
              Import {preview.feature_count} feature{preview.feature_count === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="dl-error" style={{ marginTop: 8 }}>
          <AlertCircle size={12} /><span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ── Feature → SketchNode ────────────────────────────────────────────────

function featureToNode(
  f: ParsedFeature,
  sketchId: string,
  layerId: string,
): SketchNode | null {
  const geom = f.geometry
  if (!geom) return null
  const positions = extractPositions(geom)
  if (!positions || positions.length === 0) return null

  const kind: GeometryKind = geom.type === 'Point' ? 'point'
    : geom.type === 'LineString' ? 'line'
    : geom.type === 'Polygon' ? 'polygon'
    : 'other'
  if (kind === 'other') return null

  const type: NodeType = 'sketch'
  const name = (f.properties?.name as string | undefined)
    || (f.properties?.NAME as string | undefined)
    || `imported_${kind}_${Math.random().toString(36).slice(2, 6)}`

  return {
    id: generateNodeId(),
    type,
    inputs: [],
    template_id: null,
    params: {
      geometry: kind,
      positions,
      sketchId,
      sketchLayer: layerId,
    },
    attributes: {
      ...(f.properties ?? {}),
      name,
    },
    style: {},
  }
}

function extractPositions(geom: ParsedGeometry): Position[] | null {
  const c = geom.coordinates
  if (geom.type === 'Point' && Array.isArray(c) && typeof c[0] === 'number') {
    return [coerce(c as number[])]
  }
  if (geom.type === 'LineString' && Array.isArray(c) && Array.isArray(c[0])) {
    return (c as number[][]).map(coerce)
  }
  if (geom.type === 'Polygon' && Array.isArray(c) && Array.isArray(c[0])) {
    // Use the outer ring; drop the closing duplicate vertex if present.
    const ring = c[0] as number[][]
    const ps = ring.map(coerce)
    if (ps.length >= 2 && ps[0][0] === ps[ps.length - 1][0] && ps[0][1] === ps[ps.length - 1][1]) {
      ps.pop()
    }
    return ps
  }
  return null
}

function coerce(p: number[]): Position {
  if (p.length >= 3) return [p[0], p[1], p[2]]
  return [p[0], p[1]]
}
