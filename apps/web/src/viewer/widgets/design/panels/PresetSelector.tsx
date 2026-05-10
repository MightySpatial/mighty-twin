/**
 * PresetSelector — grid of layer-preset tiles for the active sketch.
 *
 * Loads `/api/sites/{slug}/design-layer-presets` once per site. Each
 * preset is a bundle of `{ name, colour, presetValue, fields }` layer
 * specs; clicking a tile applies the bundle to the active sketch by
 * appending its layers (we don't replace — users can curate). The
 * preset's first new layer becomes active so the next draw lands on it.
 *
 * Spec V1_SPEC.md §5 (panel structure — preset selector lives in the
 * sketch gallery header) + §3 (sites.metadata.design_layer_presets).
 */
import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import type { SchemaField, SketchLayerSpec } from '../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface PresetLayer {
  name: string
  colour?: string
  presetValue?: string
  fields?: SchemaField[]
}

interface Preset {
  id: string
  name: string
  description?: string
  layers: PresetLayer[]
}

interface Props {
  siteSlug: string
  /** Active sketch id — required to apply. */
  activeSketchId: string | null
}

export default function PresetSelector({ siteSlug, activeSketchId }: Props) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [appliedId, setAppliedId] = useState<string | null>(null)

  const addLayer = useCadEngine(s => s.addLayer)
  const setActiveLayer = useCadEngine(s => s.setActiveLayer)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('accessToken')
        const r = await fetch(
          `${API_URL}/api/sites/${siteSlug}/design-layer-presets`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        )
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json() as { presets?: Preset[] }
        if (cancelled) return
        setPresets(Array.isArray(data.presets) ? data.presets : [])
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [siteSlug])

  function applyPreset(preset: Preset) {
    if (!activeSketchId || preset.layers.length === 0) return
    let firstId: string | null = null
    for (const l of preset.layers) {
      const partial: Partial<SketchLayerSpec> = {
        name: l.name,
        colour: l.colour,
        presetValue: l.presetValue,
        fields: l.fields,
      }
      const id = addLayer(activeSketchId, partial)
      if (firstId == null) firstId = id
    }
    if (firstId) setActiveLayer(firstId)
    setAppliedId(preset.id)
    // Clear the "applied" flash after a moment.
    window.setTimeout(() => setAppliedId(prev => (prev === preset.id ? null : prev)), 1200)
  }

  // Hide the section entirely until we know whether anything came back.
  if (loading) {
    return (
      <div className="dw-presets">
        <div className="dw-presets__hd">Presets</div>
        <div className="dw-presets__hint">Loading…</div>
      </div>
    )
  }
  if (error || presets.length === 0) {
    // No presets configured for this site — silently render nothing so
    // the gallery stays compact.
    return null
  }

  return (
    <div className="dw-presets">
      <div className="dw-presets__hd">Presets</div>
      <div className="dw-presets__grid">
        {presets.map(p => {
          const swatches = p.layers.slice(0, 4).map(l => l.colour ?? 'var(--dw-fill-3)')
          const flash = appliedId === p.id
          const disabled = !activeSketchId
          return (
            <button
              key={p.id}
              type="button"
              className={`dw-preset-tile${flash ? ' is-applied' : ''}`}
              disabled={disabled}
              onClick={() => applyPreset(p)}
              title={p.description || `Apply ${p.layers.length} layer${p.layers.length === 1 ? '' : 's'}`}
            >
              <div className="dw-preset-tile__swatches">
                {swatches.map((c, i) => (
                  <span
                    key={i}
                    className="dw-preset-tile__swatch"
                    style={{ background: c }}
                  />
                ))}
                {p.layers.length === 0 && <Layers size={14} />}
              </div>
              <div className="dw-preset-tile__name">{p.name}</div>
              <div className="dw-preset-tile__count">
                {p.layers.length} layer{p.layers.length === 1 ? '' : 's'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
