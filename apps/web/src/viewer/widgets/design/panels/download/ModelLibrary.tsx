/**
 * ModelLibrary — 3D model preset browser for the Download tab's
 * "Import objects" section.
 *
 * Lists glb/gltf/stl/ifc presets from `/api/design/models`. Clicking a
 * tile inserts a new `model` node into the active sketch at the
 * sketch's local origin (or [0,0,0] when no origin is set). The
 * georeference editor + drag-to-place flow is a Phase 6 follow-up;
 * this panel intentionally keeps the round-trip minimal so the wiring
 * is testable as soon as model upload lands.
 *
 * Spec V1_SPEC.md §3 design_models, §4 model endpoints.
 */
import { useEffect, useState, useMemo } from 'react'
import { Loader, AlertCircle, Box } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import { generateNodeId } from '../../sketch/dagOps'
import type { SketchNode } from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface DesignModelRow {
  id: string
  name: string
  description?: string | null
  category?: string | null
  format?: string | null
  storage_size_bytes?: number | null
  thumbnail_key?: string | null
  url: string
  georeference?: Record<string, unknown> | null
}

const ALL = '__all__'

export default function ModelLibrary() {
  const sketches = useCadEngine(s => s.sketches)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const addNode = useCadEngine(s => s.addNode)

  const [rows, setRows] = useState<DesignModelRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState<string>(ALL)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('accessToken')
    setError(null)
    fetch(`${API_URL}/api/design/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: DesignModelRow[]) => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setRows([]) } })
    return () => { cancelled = true }
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows ?? []) if (r.category) set.add(r.category)
    return Array.from(set).sort()
  }, [rows])

  const visibleRows = useMemo(() => {
    if (!rows) return []
    const q = filter.trim().toLowerCase()
    return rows.filter(r => {
      if (category !== ALL && r.category !== category) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.description ?? '').toLowerCase().includes(q)
    })
  }, [rows, category, filter])

  function handleInsert(model: DesignModelRow) {
    if (!activeSketchId) {
      setError('Open a sketch before importing a model.')
      return
    }
    const sketch = sketches[activeSketchId]
    if (!sketch) return

    setBusy(true)
    try {
      const georef = (model.georeference ?? {}) as { lon?: number; lat?: number; alt?: number; heading?: number; pitch?: number; roll?: number }
      const lon = typeof georef.lon === 'number' ? georef.lon : sketch.localOrigin.lon
      const lat = typeof georef.lat === 'number' ? georef.lat : sketch.localOrigin.lat
      const alt = typeof georef.alt === 'number' ? georef.alt : sketch.localOrigin.alt

      const node: SketchNode = {
        id: generateNodeId(),
        type: 'model',
        inputs: [],
        template_id: null,
        params: {
          geometry: 'point',
          positions: [[lon, lat, alt]],
          sketchId: activeSketchId,
          sketchLayer: activeLayerId ?? sketch.activeLayerId,
          heading: typeof georef.heading === 'number' ? georef.heading : 0,
          pitch: typeof georef.pitch === 'number' ? georef.pitch : 0,
          roll: typeof georef.roll === 'number' ? georef.roll : 0,
          modelId: model.id,
          modelUrl: model.url,
          modelFormat: model.format ?? null,
          modelName: model.name,
        },
        attributes: {
          name: model.name,
          model_id: model.id,
          ...(model.category ? { category: model.category } : {}),
        },
        style: { color: '#22d3ee', opacity: 1 },
      }
      addNode(node)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) {
    return (
      <div className="ml-loading">
        <Loader size={14} className="spin" />
        <span>Loading models…</span>
      </div>
    )
  }

  return (
    <div className="ml-panel">
      <div className="dl-row">
        <select className="dl-select" value={category} onChange={e => setCategory(e.target.value)}>
          <option value={ALL}>All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          className="dl-input"
          type="text"
          placeholder="Search…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      {error && <div className="dl-error"><AlertCircle size={12} /><span>{error}</span></div>}
      {visibleRows.length === 0 ? (
        <div className="ml-empty">
          <Box size={20} aria-hidden />
          <p>No models available yet.</p>
          <p className="ml-empty-hint">Upload glb/gltf/stl/ifc files to your library and they will appear here.</p>
        </div>
      ) : (
        <ul className="ml-grid">
          {visibleRows.map(m => (
            <li key={m.id}>
              <button
                type="button"
                className="ml-tile"
                disabled={busy || !activeSketchId}
                onClick={() => handleInsert(m)}
                title={m.description ?? m.name}
              >
                <span className="ml-tile-thumb" aria-hidden>
                  <Box size={20} />
                </span>
                <span className="ml-tile-name">{m.name}</span>
                {m.format && <span className="ml-tile-meta">{m.format.toUpperCase()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
