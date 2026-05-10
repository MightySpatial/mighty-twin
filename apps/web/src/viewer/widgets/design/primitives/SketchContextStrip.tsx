/** Sticky context strip below the panel header, mirrors v1's
 *  `.sketch-draw-workspace` / `.sdw-meta` pattern. Shows the active
 *  draw layer (swatch + dropdown), the "remember this layer" star, and
 *  a snap toggle. */
import type { SketchLayerSpec } from '../sketch/types'

interface Props {
  layers: SketchLayerSpec[]
  activeLayerId: string
  onSetActiveLayer: (id: string) => void
  defaultLayerId: string | null
  onSetDefaultLayer: (id: string | null) => void
  snapEnabled: boolean
  onSnapToggle: (v: boolean) => void
}

export default function SketchContextStrip({
  layers, activeLayerId, onSetActiveLayer,
  defaultLayerId, onSetDefaultLayer,
  snapEnabled, onSnapToggle,
}: Props) {
  const visible = layers.filter(l => l.visible)
  if (visible.length === 0) return null
  const active = layers.find(l => l.id === activeLayerId)
  const isDefault = defaultLayerId === activeLayerId

  return (
    <div className="sketch-context-strip">
      <span
        className="sketch-context-strip__swatch"
        style={{ background: active?.colour ?? '#94a3b8' }}
        title="Active layer color"
      />
      {visible.length > 1 ? (
        <select
          className="sketch-context-strip__select"
          value={activeLayerId}
          onChange={e => onSetActiveLayer(e.target.value)}
          title="Draw on this layer"
        >
          {visible.map(layer => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
      ) : (
        <span className="sketch-context-strip__static" title={active?.name}>
          {active?.name ?? 'Layer'}
        </span>
      )}
      <button
        type="button"
        className={`sketch-context-strip__star${isDefault ? ' is-on' : ''}`}
        title={isDefault ? 'Unset default layer' : 'Remember this layer for next time'}
        onClick={() => onSetDefaultLayer(isDefault ? null : activeLayerId)}
      >
        <svg viewBox="0 0 16 16" width={12} height={12} fill="currentColor">
          <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.8 5L8 12.4 3.6 14.7l.8-5L.8 6.2l5-.7z" />
        </svg>
      </button>
      <label className="sketch-context-strip__snap">
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={e => onSnapToggle(e.target.checked)}
        />
        <span>Snap</span>
      </label>
    </div>
  )
}
