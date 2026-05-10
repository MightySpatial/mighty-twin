/**
 * DownloadTab — import / export / Submit-for-Review.
 *
 * Sections (top → bottom):
 *   1. Summary banner.
 *   2. Export Geometry — format + CRS + split + download button.
 *   3. Import Geometry — file picker (geojson/shp/gpkg/kml/kmz/dxf/csv);
 *      POST /api/design/import → preview FeatureCollection + detected
 *      CRS → confirm to add features as new sketch nodes.
 *   4. Import Objects — 3D model library from GET /api/design/models;
 *      click a thumbnail to place a model node at the globe centre;
 *      Upload button → POST /api/design/models/upload (GLB/glTF/STL ≤ 50 MB).
 *   5. Submit for Review — sends current sketch to the redline pipeline.
 *
 * The Export panel re-uses the existing format catalogue + useDownload
 * helper; we adapt the engine's nodes into the GeoJSON FeatureCollection
 * that the helper expects.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Upload, Loader, AlertCircle, Box, Image as ImageIcon } from 'lucide-react'
import {
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  type Viewer,
} from 'cesium'
import { useCadEngine } from '../../sketch/useCadEngine'
import { generateNodeId } from '../../sketch/dagOps'
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from '../download/formats'
import type { SplitMode } from '../download/split'
import { geojsonToCsv } from '../download/csv'
import { splitFeatures, slugifySplitKey } from '../download/split'
import type { GeoJSONFeature } from '../../serializeFeatures'
import type {
  GeometryKind,
  NodeType,
  Position,
  SketchNode,
} from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

const IMPORT_ACCEPT = '.geojson,.json,.shp,.zip,.gpkg,.kml,.kmz,.dxf,.csv,.tsv'
const MODEL_ACCEPT  = '.glb,.gltf,.stl'

interface Props {
  viewer: Viewer | null
  siteSlug?: string | null
}

interface CrsOption { epsg: number; name: string }

interface Submission {
  id: string
  status: string
  feature_count: number
  created_at: string | null
  schema_changes_count: number
  schema_changes_approved: boolean
}

interface ImportedGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | string
  coordinates: unknown
}
interface ImportedFeature {
  type: 'Feature'
  geometry: ImportedGeometry | null
  properties?: Record<string, unknown>
}
interface ImportPreview {
  filename: string
  extension: string
  crs_detected: string
  crs_epsg: number
  feature_count: number
  geometry_counts: Record<string, number>
  field_schema: string[]
  features: ImportedFeature[]
}

interface DesignModel {
  id: string
  name: string
  description?: string | null
  category?: string | null
  format?: string | null
  url: string
  thumbnail_key?: string | null
  storage_size_bytes?: number | null
}

export default function DownloadTab({ viewer, siteSlug = null }: Props) {
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const addNode = useCadEngine(s => s.addNode)

  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [crs, setCrs] = useState<number>(4326)
  const [splitMode, setSplitMode] = useState<SplitMode>('none')
  const [splitAttr, setSplitAttr] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [crsOptions, setCrsOptions] = useState<CrsOption[]>([])

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitNotes, setSubmitNotes] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([])

  // Import-geometry state
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Import-objects (3D model library) state
  const modelInputRef = useRef<HTMLInputElement>(null)
  const [models, setModels] = useState<DesignModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [uploadingModel, setUploadingModel] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)

  const sketch = activeSketchId ? sketches[activeSketchId] : null
  const sketchNodes = useMemo(
    () => Object.values(nodes).filter(n => n.params.sketchId === activeSketchId),
    [nodes, activeSketchId],
  )

  // ── CRS options ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/design/export/crs-options`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(data => setCrsOptions(data?.presets ?? []))
      .catch(() => setCrsOptions([
        { epsg: 4326, name: 'WGS 84 (EPSG:4326)' },
        { epsg: 3857, name: 'Web Mercator (EPSG:3857)' },
      ]))
  }, [])

  // ── My submissions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!siteSlug) return
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/design/submissions/mine/list`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((rows: Submission[]) => setMySubmissions(rows))
      .catch(() => undefined)
  }, [siteSlug, submitting])

  // ── Model library ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setModelsLoading(true)
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/design/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((rows: DesignModel[]) => { if (!cancelled) setModels(rows ?? []) })
      .catch(() => { if (!cancelled) setModels([]) })
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
  }, [uploadingModel])

  // ── Helpers ─────────────────────────────────────────────────────────
  function buildFeatureCollection(): GeoJSONFeature[] {
    const out: GeoJSONFeature[] = []
    for (const n of sketchNodes) {
      const positions = n.params.positions ?? []
      if (positions.length === 0) continue
      const geometry =
        n.params.geometry === 'point' && positions[0]
          ? { type: 'Point' as const, coordinates: positions[0] as [number, number, number] }
        : n.params.geometry === 'line'
          ? { type: 'LineString' as const, coordinates: positions as [number, number, number?][] }
        : n.params.geometry === 'polygon'
          ? { type: 'Polygon' as const, coordinates: [positions as [number, number, number?][]] }
        : null
      if (!geometry) continue
      out.push({
        type: 'Feature',
        id: n.id,
        geometry,
        properties: {
          ...n.attributes,
          _design: {
            geometry_kind: n.type,
            sketch_id: n.params.sketchId,
            layer_id: n.params.sketchLayer,
            style: n.style,
          },
        },
      })
    }
    return out
  }

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

  async function postServer(fc: GeoJSONFeature[], targetFormat: ExportFormat, name: string): Promise<{ blob: Blob; ext: string }> {
    const token = localStorage.getItem('accessToken')
    const r = await fetch(`${API_URL}/api/design/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        feature_collection: { type: 'FeatureCollection', features: fc },
        format: targetFormat,
        target_epsg: crs,
        filename: name,
      }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({} as { detail?: string }))).detail || `Export failed (${r.status})`)
    const cd = r.headers.get('Content-Disposition') || ''
    const m = cd.match(/filename="?([^"]+)"?/i)
    const fname = m ? m[1] : `${name}.${targetFormat}`
    const ix = fname.lastIndexOf('.')
    return { blob: await r.blob(), ext: ix >= 0 ? fname.slice(ix + 1) : targetFormat }
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      if (format === 'json_state') {
        trigger(
          `mighty-twin-design-state-${stamp}.json`,
          JSON.stringify({ schema: 1, exported_at: new Date().toISOString(), sketches, nodes }, null, 2),
          'application/json',
        )
        return
      }

      const features = buildFeatureCollection()
      if (features.length === 0) throw new Error('No features to export.')

      const groups = splitFeatures(features, splitMode, splitAttr)
      for (const { key, items } of groups) {
        if (items.length === 0) continue
        const baseName = groups.length === 1 ? `mighty-twin-${stamp}` : `${slugifySplitKey(key)}-${stamp}`
        if (format === 'geojson' && crs === 4326) {
          trigger(`${baseName}.geojson`, JSON.stringify({ type: 'FeatureCollection', features: items }, null, 2), 'application/geo+json')
        } else if (format === 'csv' && crs === 4326) {
          trigger(`${baseName}.csv`, geojsonToCsv(items), 'text/csv')
        } else {
          const { blob, ext } = await postServer(items, format, baseName)
          trigger(`${baseName}.${ext}`, blob, blob.type || 'application/octet-stream')
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  // ── Import: parse + preview ────────────────────────────────────────
  async function onImportFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportError(null)
    setImportPreview(null)
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
        const detail = await r.json().catch(() => ({})) as { detail?: string }
        throw new Error(detail.detail || `Import failed (${r.status})`)
      }
      const data = await r.json() as ImportPreview
      setImportPreview(data)
    } catch (err) {
      setImportError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function importedFeaturesToNodes(preview: ImportPreview): SketchNode[] {
    if (!activeSketchId || !activeLayerId) return []
    const result: SketchNode[] = []
    for (const f of preview.features) {
      const geom = f.geometry
      if (!geom) continue
      let geometry: GeometryKind
      let positions: Position[]
      if (geom.type === 'Point') {
        geometry = 'point'
        const c = geom.coordinates as number[]
        positions = [coordToPosition(c)]
      } else if (geom.type === 'LineString') {
        geometry = 'line'
        positions = (geom.coordinates as number[][]).map(coordToPosition)
      } else if (geom.type === 'Polygon') {
        geometry = 'polygon'
        const ring = (geom.coordinates as number[][][])[0] ?? []
        positions = ring.map(coordToPosition)
      } else {
        continue
      }
      // Drop the `_design` envelope on a fresh import — these are
      // foreign features, not round-trips.
      const props = (f.properties ?? {}) as Record<string, unknown>
      const properties: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) {
        if (k !== '_design') properties[k] = v
      }
      result.push({
        id: generateNodeId(),
        type: 'sketch',
        inputs: [],
        template_id: null,
        params: {
          geometry,
          positions,
          sketchId: activeSketchId,
          sketchLayer: activeLayerId,
        },
        attributes: properties,
        style: {},
      })
    }
    return result
  }

  function commitImport() {
    if (!importPreview) return
    if (!activeSketchId || !activeLayerId) {
      setImportError('Activate a sketch + layer before importing.')
      return
    }
    const newNodes = importedFeaturesToNodes(importPreview)
    for (const n of newNodes) addNode(n)
    setImportPreview(null)
  }

  // ── Submission ─────────────────────────────────────────────────────
  async function submit() {
    if (!siteSlug) {
      setSubmitError('Submission requires a site context')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const features = buildFeatureCollection()
      if (features.length === 0) throw new Error('No features to submit.')
      const token = localStorage.getItem('accessToken')
      const r = await fetch(`${API_URL}/api/design/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          site_slug: siteSlug,
          features,
          notes: submitNotes,
          sketch_metadata: sketch ? {
            redline: sketch.redline,
            target_data_source_id: sketch.targetDataSourceId,
            coord_mode: sketch.coordMode,
            coord_crs: sketch.coordCrs,
            height_datum: sketch.heightDatum,
            change_set: sketch.changeSet,
          } : {},
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({} as { detail?: string }))).detail || `Submit failed (${r.status})`)
      setSubmitNotes('')
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Object library: place model + upload ───────────────────────────
  function placeModel(model: DesignModel) {
    if (!viewer) {
      setModelError('Globe not ready.')
      return
    }
    if (!activeSketchId || !activeLayerId) {
      setModelError('Activate a sketch + layer first.')
      return
    }
    const center = globeCentre(viewer)
    if (!center) {
      setModelError('Could not resolve globe centre — pan the camera over the globe and retry.')
      return
    }
    const node: SketchNode = {
      id: generateNodeId(),
      type: 'model' as NodeType,
      inputs: [],
      template_id: null,
      params: {
        geometry: 'point',
        positions: [center],
        sketchId: activeSketchId,
        sketchLayer: activeLayerId,
        modelId: model.id,
        modelUrl: model.url,
        modelFormat: model.format ?? undefined,
        heading: 0,
        pitch: 0,
        roll: 0,
      },
      attributes: { name: model.name },
      style: {},
    }
    addNode(node)
    setModelError(null)
  }

  async function onModelUploadChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      setModelError('File too large (max 50 MB).')
      return
    }
    setUploadingModel(true)
    setModelError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('accessToken')
      const r = await fetch(`${API_URL}/api/design/models/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!r.ok) {
        const detail = await r.json().catch(() => ({})) as { detail?: string }
        throw new Error(detail.detail || `Upload failed (${r.status})`)
      }
    } catch (err) {
      setModelError((err as Error).message)
    } finally {
      setUploadingModel(false)
    }
  }

  return (
    <div className="dl-panel">
      <div className="dl-summary">
        <Download size={16} className="dl-summary-icon" />
        <div>
          <div className="dl-summary-count">
            {sketchNodes.length} feature{sketchNodes.length === 1 ? '' : 's'} ready
          </div>
          <div className="dl-summary-meta">
            From {sketch?.name ?? 'no active sketch'}
          </div>
        </div>
      </div>

      {/* ── Export ───────────────────────────────────────────────────── */}
      <div className="dl-section-label">Export Geometry</div>
      <div className="dl-row">
        <select className="dl-select" value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>
          {Array.from(new Set(EXPORT_FORMATS.map(f => f.group))).map(g => (
            <optgroup key={g} label={g}>
              {EXPORT_FORMATS.filter(f => f.group === g).map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="dl-select" value={crs} onChange={e => setCrs(Number(e.target.value))} disabled={format === 'json_state'}>
          {crsOptions.map(o => <option key={o.epsg} value={o.epsg}>{o.name}</option>)}
        </select>
      </div>
      <div className="dl-row">
        <select className="dl-select" value={splitMode} onChange={e => setSplitMode(e.target.value as SplitMode)} disabled={format === 'json_state'}>
          <option value="none">No split</option>
          <option value="layer">By layer</option>
          <option value="attribute">By attribute</option>
        </select>
        {splitMode === 'attribute' && (
          <input className="dl-input" type="text" placeholder="Attribute name" value={splitAttr} onChange={e => setSplitAttr(e.target.value)} />
        )}
      </div>
      {error && <div className="dl-error"><AlertCircle size={12} /><span>{error}</span></div>}
      <button className="dl-export-btn" onClick={download} disabled={downloading || sketchNodes.length === 0}>
        {downloading ? <><Loader size={12} className="spin" /> Exporting…</> : <>↓ Export</>}
      </button>

      {/* ── Import geometry ──────────────────────────────────────────── */}
      <div className="dl-section-label" style={{ marginTop: 16 }}>Import Geometry</div>
      <p className="dl-hint">GeoJSON, Shapefile (.zip), GeoPackage, KML/KMZ, DXF, CSV — features land in the active sketch layer.</p>
      <input
        ref={importInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        style={{ display: 'none' }}
        onChange={onImportFileChosen}
      />
      <button
        type="button"
        className="dl-export-btn dl-export-btn--secondary"
        onClick={() => importInputRef.current?.click()}
        disabled={importing}
      >
        {importing
          ? <><Loader size={12} className="spin" /> Parsing…</>
          : <><Upload size={12} /> Choose file…</>}
      </button>
      {importError && <div className="dl-error"><AlertCircle size={12} /><span>{importError}</span></div>}
      {importPreview && (
        <div className="dl-import-preview">
          <div className="dl-import-preview__head">
            <strong>{importPreview.filename}</strong>
            <span className="dl-import-preview__crs">{importPreview.crs_detected}</span>
          </div>
          <div className="dl-import-preview__counts">
            {importPreview.feature_count} features
            {Object.entries(importPreview.geometry_counts).map(([k, v]) => (
              <span key={k} className="dl-import-preview__chip">{k}: {v}</span>
            ))}
          </div>
          {importPreview.field_schema.length > 0 && (
            <div className="dl-import-preview__fields">
              Fields: {importPreview.field_schema.slice(0, 8).join(', ')}
              {importPreview.field_schema.length > 8 ? ` (+${importPreview.field_schema.length - 8})` : ''}
            </div>
          )}
          <div className="dl-import-preview__actions">
            <button type="button" className="ae-save-cancel" onClick={() => setImportPreview(null)}>Cancel</button>
            <button
              type="button"
              className="ae-save-ok"
              onClick={commitImport}
              disabled={!activeSketchId || !activeLayerId || importPreview.feature_count === 0}
            >
              Add to sketch
            </button>
          </div>
        </div>
      )}

      {/* ── Import objects (3D model library) ────────────────────────── */}
      <div className="dl-section-label" style={{ marginTop: 16 }}>Import Objects</div>
      <p className="dl-hint">3D model library — click a thumbnail to drop it at the globe centre.</p>
      <input
        ref={modelInputRef}
        type="file"
        accept={MODEL_ACCEPT}
        style={{ display: 'none' }}
        onChange={onModelUploadChosen}
      />
      <button
        type="button"
        className="dl-export-btn dl-export-btn--secondary"
        onClick={() => modelInputRef.current?.click()}
        disabled={uploadingModel}
      >
        {uploadingModel
          ? <><Loader size={12} className="spin" /> Uploading…</>
          : <><Upload size={12} /> Upload model (GLB / glTF / STL)</>}
      </button>
      {modelError && <div className="dl-error"><AlertCircle size={12} /><span>{modelError}</span></div>}
      {modelsLoading ? (
        <div className="dl-hint"><Loader size={12} className="spin" /> Loading library…</div>
      ) : models.length === 0 ? (
        <p className="dl-hint">No models yet. Upload a GLB/glTF/STL to start your library.</p>
      ) : (
        <div className="dl-model-grid">
          {models.map(m => (
            <button
              key={m.id}
              type="button"
              className="dl-model-tile"
              onClick={() => placeModel(m)}
              title={`Place ${m.name} at globe centre`}
              disabled={!activeSketchId || !activeLayerId}
            >
              <div className="dl-model-thumb">
                {m.thumbnail_key
                  ? <ImageIcon size={20} aria-hidden />
                  : <Box size={20} aria-hidden />}
              </div>
              <span className="dl-model-name">{m.name}</span>
              {m.format && <span className="dl-model-format">{m.format}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Submit for review ─────────────────────────────────────────── */}
      {siteSlug && (
        <>
          <div className="dl-section-label" style={{ marginTop: 16 }}>Submit for Review</div>
          <textarea
            className="ae-save-inp"
            value={submitNotes}
            onChange={e => setSubmitNotes(e.target.value)}
            placeholder="Notes for the reviewer…"
            rows={3}
            style={{ height: 'auto', resize: 'vertical', padding: 6 }}
          />
          {submitError && <div className="dl-error"><AlertCircle size={12} /><span>{submitError}</span></div>}
          <button className="dl-export-btn" onClick={submit} disabled={submitting || sketchNodes.length === 0}>
            {submitting ? <><Loader size={12} className="spin" /> Submitting…</> : <>↗ Submit</>}
          </button>

          {mySubmissions.length > 0 && (
            <>
              <div className="dl-section-label" style={{ marginTop: 12 }}>My Submissions</div>
              <ul className="my-subs">
                {mySubmissions.map(s => (
                  <li key={s.id} className="my-sub">
                    <span className={`my-sub__status my-sub__status--${s.status}`}>
                      {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : s.status === 'promoted' ? '◆' : '⏳'}
                    </span>
                    <span className="my-sub__count">{s.feature_count} feat</span>
                    <span className="my-sub__date">{s.created_at?.slice(0, 10)}</span>
                    {s.schema_changes_count > 0 && (
                      <span className="my-sub__schema">
                        +{s.schema_changes_count} schema{s.schema_changes_approved ? ' ✓' : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Convert a GeoJSON coordinate triple to the engine's Position tuple. */
function coordToPosition(c: number[]): Position {
  if (c.length >= 3) return [c[0], c[1], c[2]]
  return [c[0], c[1]]
}

/** Resolve the lon/lat/alt at the centre of the current viewport.
 *  Returns null when the camera is pointed off the globe. */
function globeCentre(viewer: Viewer): Position | null {
  const canvas = viewer.scene.canvas
  const screen = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  const ray = viewer.camera.getPickRay(screen)
  const hit = (ray ? viewer.scene.globe.pick(ray, viewer.scene) : null)
    ?? viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid)
  if (!hit) return null
  const carto = Cartographic.fromCartesian(hit)
  return [
    CesiumMath.toDegrees(carto.longitude),
    CesiumMath.toDegrees(carto.latitude),
    carto.height,
  ]
}
