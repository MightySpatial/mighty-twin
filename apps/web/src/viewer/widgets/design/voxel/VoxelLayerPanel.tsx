/**
 * VoxelLayerPanel — small inspector shown in the LayersTab when a voxel
 * layer is selected. Surfaces:
 *   • layer name + scope badge (Site / Sketch)
 *   • datum readout (lon, lat, alt)
 *   • generator list — each row shows type + key params + delete
 *   • Export as IFC button — POST /api/sites/{slug}/voxel-layers/{id}/export-ifc
 *   • Export as ESV button — downloads the serialized .esv JSON locally
 *
 * Engine state is read from `useSvoEngine`; the .esv export uses
 * `serializeLayer` directly so no extra API round-trip is needed.
 */
import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { serializeLayer, useSvoEngine } from './useSvoEngine'
import type { SVOGenerator } from './types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

function paramsSummary(g: SVOGenerator): string {
  const p = g.params
  switch (g.type) {
    case 'box_fill':
      return `i:${p.iMin}..${p.iMax}, j:${p.jMin}..${p.jMax}, k:${p.kMin}..${p.kMax}`
    case 'pyramid':
      return `base ${p.baseHalf}h × ${p.height} tall, slope ${p.slope}`
    case 'wedge':
      return `i:${p.iMin}..${p.iMax}, base k:${p.kBase}, top:${p.kTopMin}..${p.kTopMax}`
    case 'prism':
      return `${(p.footprint as unknown[] | undefined)?.length ?? 0} verts, k:${p.kBase}..${p.kTop}`
    case 'dome':
      return `r ${p.rx}/${p.ry}/${p.rz}, ${p.halfOnly === false ? 'sphere' : 'half'}`
    case 'terrain_mask': {
      const hm = p.heightmap as number[][] | undefined
      return `${hm?.length ?? 0}×${hm?.[0]?.length ?? 0} grid, base k:${p.baseK}`
    }
    case 'water_fill':
      return `fill alt ${p.fillElevationAlt} m`
  }
}

export default function VoxelLayerPanel() {
  const layer = useSvoEngine(s =>
    s.activeLayerId ? s.layers.find(l => l.id === s.activeLayerId) ?? null : null,
  )
  const removeGenerator = useSvoEngine(s => s.removeGenerator)
  const chunks = useSvoEngine(s => s.chunks)
  const [busy, setBusy] = useState<'ifc' | 'esv' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!layer) {
    return (
      <div className="vx-layer-panel vx-layer-panel--empty">
        <p>No voxel layer selected.</p>
      </div>
    )
  }

  function downloadEsv() {
    if (!layer) return
    setBusy('esv')
    setError(null)
    try {
      const file = serializeLayer(chunks, layer)
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(layer.name)}.esv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function exportIfc() {
    if (!layer) return
    setBusy('ifc')
    setError(null)
    try {
      const token = localStorage.getItem('accessToken')
      const r = await fetch(
        `${API_URL}/api/sites/${encodeURIComponent(layer.siteSlug)}/voxel-layers/${encodeURIComponent(layer.id)}/export-ifc`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      )
      if (!r.ok) throw new Error(`IFC export: ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(layer.name)}.ifc`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="vx-layer-panel">
      <header className="vx-layer-panel__hd">
        <span className="vx-layer-panel__name" title={layer.name}>{layer.name}</span>
        <span className={`vx-scope-badge vx-scope-badge--${layer.scope}`}>
          {layer.scope === 'site' ? 'Site' : 'Sketch'}
        </span>
      </header>

      <div className="vx-layer-datum">
        <div className="dw-section-label">Datum (WGS84)</div>
        <div className="vx-layer-datum__row">
          <span>Lon</span><b>{layer.datum.lon.toFixed(6)}°</b>
        </div>
        <div className="vx-layer-datum__row">
          <span>Lat</span><b>{layer.datum.lat.toFixed(6)}°</b>
        </div>
        <div className="vx-layer-datum__row">
          <span>Alt</span><b>{layer.datum.alt.toFixed(2)} m</b>
        </div>
      </div>

      <div className="vx-layer-gens">
        <div className="dw-section-label">Generators ({layer.generators.length})</div>
        {layer.generators.length === 0 && (
          <p className="vx-layer-gens__empty">
            No generators yet. Use the Voxel toolbox to stamp one.
          </p>
        )}
        {layer.generators.map(g => (
          <div key={g.id} className="vx-gen-row">
            <span className="vx-gen-row__type">{g.type.replace(/_/g, ' ')}</span>
            <span className="vx-gen-row__summary" title={paramsSummary(g)}>
              {paramsSummary(g)}
            </span>
            <button
              type="button"
              className="vx-gen-row__del"
              onClick={() => removeGenerator(layer.id, g.id)}
              title="Delete generator"
              aria-label="Delete generator"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {error && <div className="vx-layer-panel__error">{error}</div>}

      <div className="vx-layer-actions">
        <button
          type="button"
          className="vx-export-btn"
          onClick={exportIfc}
          disabled={busy !== null}
        >
          <Download size={12} /> {busy === 'ifc' ? 'Exporting…' : 'Export as IFC'}
        </button>
        <button
          type="button"
          className="vx-export-btn"
          onClick={downloadEsv}
          disabled={busy !== null}
        >
          <Download size={12} /> {busy === 'esv' ? 'Exporting…' : 'Export as ESV'}
        </button>
      </div>
    </div>
  )
}

function slugify(s: string): string {
  return (s || 'voxel-layer').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'voxel-layer'
}
