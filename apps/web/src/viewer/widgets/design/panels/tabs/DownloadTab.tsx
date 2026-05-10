/**
 * DownloadTab — export geometry + Submit-for-Review.
 *
 * The Export panel re-uses the existing format catalogue + useDownload
 * helper; we adapt the engine's nodes into the GeoJSON FeatureCollection
 * that the helper expects.
 *
 * Submit-for-Review is the user-side of the redline submission pipeline.
 * Posts the engine's current sketch features to /api/design/submissions,
 * then lists "My Submissions" pulled from /api/design/submissions/mine/list.
 */
import { useEffect, useMemo, useState } from 'react'
import { Download, Loader, AlertCircle } from 'lucide-react'
import type { Viewer } from 'cesium'
import { useCadEngine } from '../../sketch/useCadEngine'
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from '../download/formats'
import type { SplitMode } from '../download/split'
import { geojsonToCsv } from '../download/csv'
import { splitFeatures, slugifySplitKey } from '../download/split'
import type { GeoJSONFeature } from '../../serializeFeatures'
import ModelsLibrary from '../ModelsLibrary'
import GeometryImport from '../GeometryImport'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

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

export default function DownloadTab({ viewer, siteSlug = null }: Props) {
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)

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

  // Convert engine nodes → GeoJSON features.
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

      <ModelsLibrary viewer={viewer} />
      <GeometryImport />

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
