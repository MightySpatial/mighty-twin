/**
 * ModelsLibrary — 3D model library browser shown in DownloadTab.
 *
 * Reads /api/design/models (Phase 1E) and renders a grid of cards:
 *   • thumbnail (or first-letter fallback) + name + format badge
 *   • Place button → adds a 'model' node to the active sketch at the
 *     centre of the camera view (a real placement gesture would use a
 *     globe pick; that's the SketchTab's domain).
 *
 * When the API returns an empty list (no real assets yet), a small
 * placeholder set is rendered so the UI is browsable in dev — those
 * placeholders go away the moment the real library has rows.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Viewer } from 'cesium'
import { Box, Plus, Loader, AlertCircle } from 'lucide-react'
import { Cartesian2, Cartographic, Math as CesiumMath } from 'cesium'
import { useCadEngine } from '../sketch/useCadEngine'
import { generateNodeId } from '../sketch/dagOps'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface ModelRow {
  id: string
  name: string
  category: string
  format: string
  storage_size_bytes: number | null
  thumbnail_key: string | null
  url: string
  georeference?: Record<string, unknown>
}

interface Props {
  viewer: Viewer | null
}

// Placeholder set — only used when the API returns zero rows so the
// gallery shape is visible in dev. The placeholders carry a synthetic
// __placeholder marker so the place handler can no-op the URL fetch.
const PLACEHOLDERS: ModelRow[] = [
  { id: '__ph_box', name: 'Reference cube', category: 'shapes', format: 'glb', storage_size_bytes: null, thumbnail_key: null, url: '' },
  { id: '__ph_pole', name: 'Power pole', category: 'utility', format: 'glb', storage_size_bytes: null, thumbnail_key: null, url: '' },
  { id: '__ph_pit', name: 'Service pit', category: 'utility', format: 'glb', storage_size_bytes: null, thumbnail_key: null, url: '' },
  { id: '__ph_tree', name: 'Tree', category: 'landscape', format: 'glb', storage_size_bytes: null, thumbnail_key: null, url: '' },
]

const CATEGORY_FILTERS = ['all', 'shapes', 'utility', 'landscape', 'ifc', 'custom']

export default function ModelsLibrary({ viewer }: Props) {
  const [rows, setRows] = useState<ModelRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const addNode = useCadEngine(s => s.addNode)

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/design/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data: ModelRow[]) => {
        if (cancelled) return
        setRows(Array.isArray(data) && data.length > 0 ? data : PLACEHOLDERS)
      })
      .catch(e => {
        if (cancelled) return
        // Fall back to placeholders so the UI stays usable in dev.
        setError((e as Error).message)
        setRows(PLACEHOLDERS)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    if (filter === 'all') return rows
    return rows.filter(r => r.category === filter)
  }, [rows, filter])

  function placeAtViewCentre(): [number, number, number] | null {
    // Pick the centre of the current camera view as the anchor. Without
    // a viewer (test env / unmounted), fall back to (0, 0, 0).
    if (!viewer) return [0, 0, 0]
    const canvas = viewer.scene.canvas
    const screenCenter = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
    const ray = viewer.camera.getPickRay(screenCenter)
    const hit = ray ? viewer.scene.globe.pick(ray, viewer.scene) : null
    if (!hit) {
      // Use the camera's own carto position as the fallback.
      const pos = viewer.camera.positionCartographic
      return [
        CesiumMath.toDegrees(pos.longitude),
        CesiumMath.toDegrees(pos.latitude),
        0,
      ]
    }
    const carto = Cartographic.fromCartesian(hit)
    return [
      CesiumMath.toDegrees(carto.longitude),
      CesiumMath.toDegrees(carto.latitude),
      carto.height,
    ]
  }

  function placeModel(model: ModelRow) {
    if (!activeSketchId || !activeLayerId) {
      setError('Pick a sketch and layer first')
      return
    }
    const pos = placeAtViewCentre()
    if (!pos) {
      setError('Could not resolve a place point — try recentring the camera')
      return
    }
    setBusyId(model.id)
    try {
      addNode({
        id: generateNodeId(),
        type: 'model',
        inputs: [],
        template_id: null,
        params: {
          geometry: 'point',
          positions: [pos],
          sketchId: activeSketchId,
          sketchLayer: activeLayerId,
          modelId: model.id,
          modelName: model.name,
          modelUrl: model.url,
          modelFormat: model.format,
        },
        attributes: {
          name: model.name,
          category: model.category,
        },
        style: {},
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="dl-section">
      <div className="dl-section-label">Import Objects</div>

      <div className="ml-filters">
        {CATEGORY_FILTERS.map(c => (
          <button
            key={c}
            type="button"
            className={`ml-filter-chip${filter === c ? ' is-on' : ''}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {rows == null && (
        <div className="ml-loading"><Loader size={14} className="spin" /> Loading library…</div>
      )}

      {rows != null && filtered.length === 0 && (
        <p className="ml-empty">No models in this category.</p>
      )}

      <div className="ml-grid">
        {filtered.map(m => (
          <button
            key={m.id}
            type="button"
            className="ml-card"
            onClick={() => placeModel(m)}
            disabled={busyId === m.id || !activeSketchId || !activeLayerId}
            title={
              !activeSketchId
                ? 'Pick a sketch first'
                : !activeLayerId
                ? 'Pick a layer first'
                : `Place ${m.name} at view centre`
            }
          >
            <div className="ml-card__thumb">
              {m.thumbnail_key
                ? <img src={`${API_URL}${m.thumbnail_key}`} alt="" />
                : <Box size={20} />}
            </div>
            <div className="ml-card__body">
              <div className="ml-card__name">{m.name}</div>
              <div className="ml-card__meta">
                <span className="ml-card__fmt">{m.format.toUpperCase()}</span>
                {m.storage_size_bytes != null && (
                  <span className="ml-card__size">
                    {(m.storage_size_bytes / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
            </div>
            <div className="ml-card__action">
              {busyId === m.id ? <Loader size={14} className="spin" /> : <Plus size={14} />}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="dl-error" style={{ marginTop: 8 }}>
          <AlertCircle size={12} /><span>{error}</span>
        </div>
      )}
    </div>
  )
}

