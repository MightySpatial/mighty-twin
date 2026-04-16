/**
 * MightyTwin — Point Symbology Picker
 * Tabbed picker: Shapes | Pins | Emoji with canvas previews.
 */
import { useState, useRef, useEffect } from 'react'
import type { PointSymbolStyle, PointSymbolCategory } from './pointSymbology'
import { POINT_SYMBOL_DEFS, getSymbolDef, createPointSymbolCanvas } from './pointSymbology'

interface PointSymbologyPickerProps {
  value: PointSymbolStyle
  onChange: (style: PointSymbolStyle) => void
}

const TABS: { key: PointSymbolCategory; label: string }[] = [
  { key: 'shapes', label: 'Shapes' },
  { key: 'pins',   label: 'Pins' },
  { key: 'emoji',  label: 'Emoji' },
]

function SymbolPreview({ style, size }: { style: PointSymbolStyle; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const src = createPointSymbolCanvas({ ...style, size })
    el.width = src.width
    el.height = src.height
    const ctx = el.getContext('2d')!
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(src, 0, 0)
  }, [style, size])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}

export default function PointSymbologyPicker({ value, onChange }: PointSymbologyPickerProps) {
  const currentDef = getSymbolDef(value.symbolType)
  const initialTab = currentDef?.category ?? 'shapes'
  const [tab, setTab] = useState<PointSymbolCategory>(initialTab)
  const patch = (p: Partial<PointSymbolStyle>) => onChange({ ...value, ...p })

  const isEmoji = currentDef?.category === 'emoji'
  const defsForTab = POINT_SYMBOL_DEFS.filter(d => d.category === tab)

  return (
    <div className="psym-picker">
      {/* Category tabs */}
      <div className="psym-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`psym-tab${tab === t.key ? ' psym-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Symbol grid */}
      <div className="psym-row">
        <div className="psym-type-grid psym-type-grid--wrap">
          {defsForTab.map(d => (
            <button
              key={d.id}
              className={`psym-type-btn${value.symbolType === d.id ? ' psym-type-btn--active' : ''}`}
              onClick={() => patch({ symbolType: d.id })}
              title={d.label}
            >
              <SymbolPreview
                style={{ ...value, symbolType: d.id }}
                size={18}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Size slider */}
      <div className="psym-row">
        <label className="design-style-label">Size</label>
        <div className="design-style-slider-group">
          <input
            type="range"
            className="ext-slider"
            min={8}
            max={48}
            value={value.size}
            onChange={e => patch({ size: Number(e.target.value) })}
          />
          <span className="design-style-val">{value.size}px</span>
        </div>
      </div>

      {/* Fill color — hidden for emoji */}
      {!isEmoji && (
        <div className="psym-row">
          <label className="design-style-label">Fill</label>
          <div className="design-style-color-group">
            <input
              type="color"
              className="design-style-swatch"
              value={value.fillColor}
              onChange={e => patch({ fillColor: e.target.value })}
            />
            <input
              type="text"
              className="design-style-hex"
              value={value.fillColor}
              onChange={e => patch({ fillColor: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Stroke color — hidden for emoji */}
      {!isEmoji && (
        <div className="psym-row">
          <label className="design-style-label">Stroke</label>
          <div className="design-style-color-group">
            <input
              type="color"
              className="design-style-swatch"
              value={value.strokeColor}
              onChange={e => patch({ strokeColor: e.target.value })}
            />
            <input
              type="text"
              className="design-style-hex"
              value={value.strokeColor}
              onChange={e => patch({ strokeColor: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Opacity */}
      <div className="psym-row">
        <label className="design-style-label">Opacity</label>
        <div className="design-style-slider-group">
          <input
            type="range"
            className="ext-slider"
            min={0}
            max={100}
            value={Math.round(value.opacity * 100)}
            onChange={e => patch({ opacity: Number(e.target.value) / 100 })}
          />
          <span className="design-style-val">{Math.round(value.opacity * 100)}%</span>
        </div>
      </div>

      {/* Live preview */}
      <div className="psym-row">
        <label className="design-style-label">Preview</label>
        <div className="psym-preview">
          <SymbolPreview style={value} size={32} />
        </div>
      </div>
    </div>
  )
}
