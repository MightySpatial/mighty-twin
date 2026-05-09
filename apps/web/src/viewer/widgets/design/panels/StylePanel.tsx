/**
 * MightyTwin — Design Style Panel (faithful port of MightyDT v1 Properties tab
 * symbology section).
 *
 * Sections (in v1 order):
 *   • Stroke colour (hex + swatch)
 *   • Fill colour (hex + swatch) — polygons / surfaces
 *   • Fill opacity slider — polygons
 *   • Opacity slider — global
 *   • Line width slider (1–10) — lines + polygon outlines
 *   • Line pattern dropdown — Solid / Dash / Dot / Dash-dot
 *   • Point size slider (4–32) — points
 *   • Point shape dropdown — Circle / Square / Diamond / Triangle / Cross
 *   • Outline colour + width — points + polygons
 *   • Label field dropdown (drawn from current feature attribute keys)
 *   • Label size (8–24) — visible only when a label field is chosen
 *
 * Note: v2 also retains the PointSymbologyPicker for points (icon library);
 * it sits above the v1 controls so both surfaces are available.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import PointSymbologyPicker from '../../../shared/PointSymbologyPicker'
import { DEFAULT_POINT_SYMBOL } from '../../../shared/pointSymbology'
import type { PointSymbolStyle } from '../../../shared/pointSymbology'
import type { SketchFeature, FeatureStyle } from '../types'

interface StylePanelProps {
  feature: SketchFeature | null
  onStyleChange: (featureId: string, patch: Partial<FeatureStyle>) => void
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

const POLYGON_GEOMS = new Set(['polygon', 'rectangle', 'circle', 'box', 'pit', 'cylinder'])
const LINE_GEOMS = new Set(['line', 'traverse'])
const POINT_GEOMS = new Set(['point'])

function HexInput({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = useCallback(() => {
    if (HEX_RE.test(draft)) onChange(draft)
    else setDraft(value)
  }, [draft, value, onChange])
  return (
    <input
      type="text"
      className="design-style-hex"
      value={draft}
      onChange={e => {
        const v = e.target.value
        setDraft(v)
        if (HEX_RE.test(v)) onChange(v)
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit() }}
    />
  )
}

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
  const isPoint = POINT_GEOMS.has(feature.geometry)
  const isLine = LINE_GEOMS.has(feature.geometry)
  const isPolygon = POLYGON_GEOMS.has(feature.geometry)
  const showFillStyle = isPolygon
  const showLineStyle = isLine || isPolygon
  const showPointStyle = isPoint
  const showOutline = isPoint || isPolygon

  const labelFieldOptions = useMemo(() => {
    const keys = Object.keys(feature.attributes ?? {}).filter(k =>
      !['lon', 'lat', 'alt'].includes(k))
    return [{ value: '', label: '— No label —' }, ...keys.map(k => ({ value: k, label: k }))]
  }, [feature.attributes])

  const change = (patch: Partial<FeatureStyle>) => {
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

      {showFillStyle && (
        <>
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
            <label className="design-style-label">Fill opacity</label>
            <div className="design-style-slider-group">
              <input
                type="range"
                className="ext-slider"
                min={0}
                max={100}
                value={Math.round((style.fillOpacity ?? style.opacity) * 100)}
                onChange={e => change({ fillOpacity: Number(e.target.value) / 100 })}
              />
              <span className="design-style-val">{Math.round((style.fillOpacity ?? style.opacity) * 100)}%</span>
            </div>
          </div>
        </>
      )}

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

      {showLineStyle && (
        <>
          <div className="design-style-row">
            <label className="design-style-label">Line width</label>
            <div className="design-style-slider-group">
              <input
                type="range"
                className="ext-slider"
                min={1}
                max={10}
                value={style.lineWidth}
                onChange={e => change({ lineWidth: Number(e.target.value) })}
              />
              <span className="design-style-val">{style.lineWidth}px</span>
            </div>
          </div>
          <div className="design-style-row">
            <label className="design-style-label">Line pattern</label>
            <select
              className="design-style-select"
              value={style.lineDash ?? 'solid'}
              onChange={e => change({ lineDash: e.target.value as FeatureStyle['lineDash'] })}
            >
              <option value="solid">Solid</option>
              <option value="dash">Dash</option>
              <option value="dot">Dot</option>
              <option value="dashdot">Dash-dot</option>
            </select>
          </div>
        </>
      )}

      {showPointStyle && (
        <>
          <div className="design-style-row">
            <label className="design-style-label">Point size</label>
            <div className="design-style-slider-group">
              <input
                type="range"
                className="ext-slider"
                min={4}
                max={32}
                value={style.pointSize ?? 12}
                onChange={e => change({ pointSize: Number(e.target.value) })}
              />
              <span className="design-style-val">{style.pointSize ?? 12}px</span>
            </div>
          </div>
          <div className="design-style-row">
            <label className="design-style-label">Point shape</label>
            <select
              className="design-style-select"
              value={style.pointShape ?? 'circle'}
              onChange={e => change({ pointShape: e.target.value as FeatureStyle['pointShape'] })}
            >
              <option value="circle">Circle</option>
              <option value="square">Square</option>
              <option value="diamond">Diamond</option>
              <option value="triangle">Triangle</option>
              <option value="cross">Cross</option>
            </select>
          </div>
        </>
      )}

      {showOutline && (
        <>
          <div className="design-style-row">
            <label className="design-style-label">Outline color</label>
            <div className="design-style-color-group">
              <input
                type="color"
                className="design-style-swatch"
                value={style.outlineColor ?? style.strokeColor}
                onChange={e => change({ outlineColor: e.target.value })}
              />
              <HexInput
                value={style.outlineColor ?? style.strokeColor}
                onChange={hex => change({ outlineColor: hex })}
              />
            </div>
          </div>
          <div className="design-style-row">
            <label className="design-style-label">Outline width</label>
            <input
              type="number"
              className="design-style-num"
              min={0}
              max={10}
              value={style.outlineWidth ?? 2}
              onChange={e => change({ outlineWidth: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      <div className="design-style-row">
        <label className="design-style-label">Label field</label>
        <select
          className="design-style-select"
          value={style.labelField ?? ''}
          onChange={e => change({ labelField: e.target.value || null })}
        >
          {labelFieldOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {style.labelField && (
        <div className="design-style-row">
          <label className="design-style-label">Label size</label>
          <input
            type="number"
            className="design-style-num"
            min={8}
            max={24}
            value={style.labelSize ?? 12}
            onChange={e => change({ labelSize: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  )
}
