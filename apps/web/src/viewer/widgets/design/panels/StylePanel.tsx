/**
 * MightyTwin — Design Style Panel
 * Stroke color, fill color, line width, opacity for the selected feature.
 * Point features also get the PointSymbologyPicker.
 */
import { useState, useEffect, useCallback } from 'react'
import PointSymbologyPicker from '../../../shared/PointSymbologyPicker'
import { DEFAULT_POINT_SYMBOL } from '../../../shared/pointSymbology'
import type { PointSymbolStyle } from '../../../shared/pointSymbology'
import type { SketchFeature, FeatureStyle } from '../types'

interface StylePanelProps {
  feature: SketchFeature | null
  onStyleChange: (featureId: string, patch: Partial<FeatureStyle>) => void
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

/* ── Hex text input with local draft state ───────────────────────────────── */

function HexInput({
  value,
  onChange,
}: {
  value: string
  onChange: (hex: string) => void
}) {
  const [draft, setDraft] = useState(value)

  // Sync from parent when the authoritative value changes
  useEffect(() => { setDraft(value) }, [value])

  const commit = useCallback(() => {
    if (HEX_RE.test(draft)) onChange(draft)
    else setDraft(value) // revert invalid
  }, [draft, value, onChange])

  return (
    <input
      type="text"
      className="design-style-hex"
      value={draft}
      onChange={e => {
        const v = e.target.value
        setDraft(v)
        // Apply immediately when valid so the swatch updates in real time
        if (HEX_RE.test(v)) onChange(v)
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit() }}
    />
  )
}

/* ── Style Panel ─────────────────────────────────────────────────────────── */

export default function StylePanel({ feature, onStyleChange }: StylePanelProps) {
  if (!feature) {
    return (
      <div className="design-style-empty">
        <span className="design-style-empty-icon">◇</span>
        No feature selected
      </div>
    )
  }

  const { style } = feature
  const isPoint = feature.geometry === 'point'

  const change = (patch: Partial<FeatureStyle>) => {
    // Forward sync: main-panel colour/opacity edits → pointSymbol
    if (isPoint && style.pointSymbol) {
      const psKeys = ['strokeColor', 'fillColor', 'opacity'] as const
      const needsSync = psKeys.some(k => k in patch)
      if (needsSync) {
        const merged = { ...style, ...patch }
        patch.pointSymbol = {
          ...style.pointSymbol,
          strokeColor: merged.strokeColor,
          fillColor: merged.fillColor,
          opacity: merged.opacity,
        }
      }
    }
    // Reverse sync: pointSymbol picker changes → top-level style properties
    // (only when the patch came from the picker, not from the main controls)
    if (isPoint && patch.pointSymbol
      && !('strokeColor' in patch || 'fillColor' in patch || 'opacity' in patch)) {
      patch.strokeColor = patch.pointSymbol.strokeColor
      patch.fillColor = patch.pointSymbol.fillColor
      patch.opacity = patch.pointSymbol.opacity
    }
    onStyleChange(feature.id, patch)
  }

  const pointSymbol: PointSymbolStyle = style.pointSymbol ?? {
    ...DEFAULT_POINT_SYMBOL,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
    opacity: style.opacity,
  }

  return (
    <div className="design-style">
      {isPoint && (
        <PointSymbologyPicker
          value={pointSymbol}
          onChange={(ps) => change({ pointSymbol: ps })}
        />
      )}

      <div className="design-style-row">
        <label className="design-style-label">Stroke color</label>
        <div className="design-style-color-group">
          <input
            type="color"
            className="design-style-swatch"
            value={style.strokeColor}
            onChange={e => change({ strokeColor: e.target.value })}
          />
          <HexInput
            value={style.strokeColor}
            onChange={hex => change({ strokeColor: hex })}
          />
        </div>
      </div>

      <div className="design-style-row">
        <label className="design-style-label">Fill color</label>
        <div className="design-style-color-group">
          <input
            type="color"
            className="design-style-swatch"
            value={style.fillColor}
            onChange={e => change({ fillColor: e.target.value })}
          />
          <HexInput
            value={style.fillColor}
            onChange={hex => change({ fillColor: hex })}
          />
        </div>
      </div>

      <div className="design-style-row">
        <label className="design-style-label">Line width</label>
        <div className="design-style-slider-group">
          <input
            type="range"
            className="ext-slider"
            min={1}
            max={12}
            value={style.lineWidth}
            onChange={e => change({ lineWidth: Number(e.target.value) })}
          />
          <span className="design-style-val">{style.lineWidth}px</span>
        </div>
      </div>

      <div className="design-style-row">
        <label className="design-style-label">Opacity</label>
        <div className="design-style-slider-group">
          <input
            type="range"
            className="ext-slider"
            min={0}
            max={100}
            value={Math.round(style.opacity * 100)}
            onChange={e => change({ opacity: Number(e.target.value) / 100 })}
          />
          <span className="design-style-val">{Math.round(style.opacity * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
