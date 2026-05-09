/**
 * MightyTwin — Design Object Editor (faithful port of MightyDT v1
 * `DesignObjectEditor.vue`). Renders dimensions / orientation / anchor /
 * construction / appearance sections for solid features (box, pit, cylinder).
 *
 * Patterns mirrored from v1:
 *   • Per-input emit on change — every field commits via `onParamChange`,
 *     which rebuilds the entity geometry. Mirrors v1's `emitParam`.
 *   • doe-grid 3-col / 2-col layout, doe-anchor-row for the ⊤/◆/⊥ refZ
 *     triplet on pits, terrain-snap button alongside anchor altitude.
 *   • Negative-value guards on dimension inputs, free-signed angles.
 */
import { useMemo } from 'react'
import type { SketchFeature, BoxDraft, PitDraft, CylDraft } from '../types'

interface Props {
  feature: SketchFeature
  onParamChange: (featureId: string, patch: Record<string, unknown>) => void
  onSnapToTerrain?: (featureId: string) => void
}

const DIMENSION_KEYS = new Set(['width', 'depth', 'height', 'radius', 'wallThickness', 'floorThickness'])
const ANGLE_KEYS = new Set(['heading', 'pitch', 'roll'])

function readNum(raw: string): number | null {
  if (raw === '' || raw == null) return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

export default function DesignObjectEditor({ feature, onParamChange, onSnapToTerrain }: Props) {
  const snap = onSnapToTerrain ? () => onSnapToTerrain(feature.id) : undefined
  const params = (feature.solidParams ?? {}) as Record<string, unknown>
  const geom = feature.geometry

  const emitParam = (name: string, raw: string) => {
    const v = readNum(raw)
    if (v == null) return
    if (DIMENSION_KEYS.has(name) && v <= 0) return
    if (v < 0 && !ANGLE_KEYS.has(name)) return
    onParamChange(feature.id, { [name]: v })
  }

  const emitChoice = (name: string, value: string | boolean) => {
    onParamChange(feature.id, { [name]: value })
  }

  const num = (key: string, fallback: number) => {
    const v = (params as Record<string, unknown>)[key]
    return typeof v === 'number' ? v : fallback
  }
  const str = (key: string, fallback: string) => {
    const v = (params as Record<string, unknown>)[key]
    return typeof v === 'string' ? v : fallback
  }

  const altDisplay = useMemo(() => {
    const alt = num('alt', 0)
    return Math.round(alt * 1000) / 1000
  }, [params.alt])

  // ── Box ───────────────────────────────────────────────────────────────────
  if (geom === 'box') {
    const draft = params as unknown as BoxDraft
    const refZ = (draft.refZ ?? 'bot') as 'bot' | 'center' | 'top'
    return (
      <div className="doe">
        <div className="doe-group">
          <div className="doe-group-label">Anchor</div>
          <div className="doe-anchor-row" role="radiogroup" aria-label="Vertical anchor reference">
            <button type="button" className={`doe-anchor-btn${refZ === 'top' ? ' on' : ''}`} title="Top — sits below anchor" onClick={() => emitChoice('refZ', 'top')}>⊤</button>
            <button type="button" className={`doe-anchor-btn${refZ === 'center' ? ' on' : ''}`} title="Centre — straddles anchor" onClick={() => emitChoice('refZ', 'center')}>◆</button>
            <button type="button" className={`doe-anchor-btn${refZ === 'bot' ? ' on' : ''}`} title="Bottom — sits on anchor" onClick={() => emitChoice('refZ', 'bot')}>⊥</button>
            <span className="doe-anchor-hint">
              {refZ === 'top' ? 'Top · sits below anchor' : refZ === 'center' ? 'Centre · straddles anchor' : 'Bottom · sits on anchor'}
            </span>
          </div>
        </div>

        <div className="doe-group">
          <div className="doe-group-label">Dimensions</div>
          <div className="doe-grid">
            <div className="doe-field"><label>W (m)</label><input type="number" className="inp" value={num('width', 5)} min={0.1} step={0.5} onChange={e => emitParam('width', e.target.value)} /></div>
            <div className="doe-field"><label>D (m)</label><input type="number" className="inp" value={num('depth', 5)} min={0.1} step={0.5} onChange={e => emitParam('depth', e.target.value)} /></div>
            <div className="doe-field"><label>H (m)</label><input type="number" className="inp" value={num('height', 5)} min={0.1} step={0.5} onChange={e => emitParam('height', e.target.value)} /></div>
          </div>
        </div>

        <OrientationGroup params={params} onParam={emitParam} />

        <div className="doe-group">
          <div className="doe-group-label">Construction</div>
          <div className="doe-grid doe-grid--2">
            <div className="doe-field doe-span-2">
              <label>Wall (m) · 0 = solid</label>
              <input type="number" className="inp" value={num('wallThickness', 0)} min={0} step={0.1} onChange={e => emitParam('wallThickness', e.target.value)} />
            </div>
          </div>
        </div>

        <AnchorAlt altDisplay={altDisplay} onAlt={v => onParamChange(feature.id, { alt: v })} onSnapToTerrain={snap} />
      </div>
    )
  }

  // ── Pit ───────────────────────────────────────────────────────────────────
  if (geom === 'pit') {
    const draft = params as unknown as PitDraft
    const shape = (draft.shape ?? 'square') as 'square' | 'round'
    const refZ = (draft.refZ ?? 'top') as 'top' | 'center' | 'bot'
    return (
      <div className="doe">
        <div className="doe-group">
          <div className="doe-group-label">Anchor</div>
          <div className="doe-anchor-row" role="radiogroup" aria-label="Vertical anchor reference">
            <button type="button" className={`doe-anchor-btn${refZ === 'top' ? ' on' : ''}`} title="Top — pit extends below terrain" onClick={() => emitChoice('refZ', 'top')}>⊤</button>
            <button type="button" className={`doe-anchor-btn${refZ === 'center' ? ' on' : ''}`} title="Centre — pit straddles terrain" onClick={() => emitChoice('refZ', 'center')}>◆</button>
            <button type="button" className={`doe-anchor-btn${refZ === 'bot' ? ' on' : ''}`} title="Bottom — pit sits on terrain" onClick={() => emitChoice('refZ', 'bot')}>⊥</button>
            <span className="doe-anchor-hint">
              {refZ === 'top' ? 'Top · sits below terrain' : refZ === 'center' ? 'Centre · straddles terrain' : 'Bottom · sits on terrain'}
            </span>
          </div>
        </div>

        <div className="doe-group">
          <div className="doe-group-label">Dimensions</div>
          <div className="doe-grid">
            <div className="doe-field doe-span-3">
              <label>Shape</label>
              <div className="doe-toggle-row">
                <button className={shape === 'square' ? 'on' : ''} onClick={() => emitChoice('shape', 'square')}>Square</button>
                <button className={shape === 'round' ? 'on' : ''} onClick={() => emitChoice('shape', 'round')}>Round</button>
              </div>
            </div>
            {shape === 'round' ? (
              <div className="doe-field doe-span-3">
                <label>Radius (m)</label>
                <input type="number" className="inp" value={num('radius', 2.5)} min={0.1} step={0.5} onChange={e => emitParam('radius', e.target.value)} />
              </div>
            ) : (
              <>
                <div className="doe-field"><label>W (m)</label><input type="number" className="inp" value={num('width', 5)} min={0.1} step={0.5} onChange={e => emitParam('width', e.target.value)} /></div>
                <div className="doe-field"><label>D (m)</label><input type="number" className="inp" value={num('depth', 5)} min={0.1} step={0.5} onChange={e => emitParam('depth', e.target.value)} /></div>
              </>
            )}
            <div className="doe-field"><label>H (m)</label><input type="number" className="inp" value={num('height', 3)} min={0.1} step={0.5} onChange={e => emitParam('height', e.target.value)} /></div>
          </div>
        </div>

        <OrientationGroup params={params} onParam={emitParam} />

        <div className="doe-group">
          <div className="doe-group-label">Construction</div>
          <div className="doe-grid doe-grid--2">
            <div className="doe-field"><label>Wall (m)</label><input type="number" className="inp" value={num('wallThickness', 0.5)} min={0.01} step={0.1} onChange={e => emitParam('wallThickness', e.target.value)} /></div>
            <div className="doe-field"><label>Floor (m)</label><input type="number" className="inp" value={num('floorThickness', 0.3)} min={0.01} step={0.1} onChange={e => emitParam('floorThickness', e.target.value)} /></div>
          </div>
        </div>

        <AnchorAlt altDisplay={altDisplay} onAlt={v => onParamChange(feature.id, { alt: v })} onSnapToTerrain={snap} />
      </div>
    )
  }

  // ── Cylinder ──────────────────────────────────────────────────────────────
  if (geom === 'cylinder') {
    const _draft = params as unknown as CylDraft
    void _draft
    return (
      <div className="doe">
        <div className="doe-group">
          <div className="doe-group-label">Dimensions</div>
          <div className="doe-grid doe-grid--2">
            <div className="doe-field"><label>Radius (m)</label><input type="number" className="inp" value={num('radius', 3)} min={0.1} step={0.5} onChange={e => emitParam('radius', e.target.value)} /></div>
            <div className="doe-field"><label>H (m)</label><input type="number" className="inp" value={num('height', 5)} min={0.1} step={0.5} onChange={e => emitParam('height', e.target.value)} /></div>
          </div>
        </div>

        <OrientationGroup params={params} onParam={emitParam} />

        <div className="doe-group">
          <div className="doe-group-label">Construction</div>
          <div className="doe-grid doe-grid--2">
            <div className="doe-field doe-span-2">
              <label>Wall (m) · 0 = solid</label>
              <input type="number" className="inp" value={num('wallThickness', 0)} min={0} step={0.1} onChange={e => emitParam('wallThickness', e.target.value)} />
            </div>
          </div>
        </div>

        <AnchorAlt altDisplay={altDisplay} onAlt={v => onParamChange(feature.id, { alt: v })} onSnapToTerrain={snap} />
      </div>
    )
  }

  // ── Non-solid fallback: just label/select hint ────────────────────────────
  void str
  return null
}

function OrientationGroup({ params, onParam }: { params: Record<string, unknown>; onParam: (name: string, raw: string) => void }) {
  const num = (key: string) => {
    const v = params[key]
    return typeof v === 'number' ? v : 0
  }
  return (
    <div className="doe-group">
      <div className="doe-group-label">Orientation</div>
      <div className="doe-grid">
        <div className="doe-field"><label>Hdg°</label><input type="number" className="inp" value={num('heading')} step={1} onChange={e => onParam('heading', e.target.value)} /></div>
        <div className="doe-field"><label>Pitch°</label><input type="number" className="inp" value={num('pitch')} step={1} onChange={e => onParam('pitch', e.target.value)} /></div>
        <div className="doe-field"><label>Roll°</label><input type="number" className="inp" value={num('roll')} step={1} onChange={e => onParam('roll', e.target.value)} /></div>
      </div>
    </div>
  )
}

function AnchorAlt({ altDisplay, onAlt, onSnapToTerrain }: { altDisplay: number; onAlt: (v: number) => void; onSnapToTerrain?: () => void }) {
  return (
    <div className="doe-group">
      <div className="doe-group-label">Anchor · WGS84</div>
      <div className="doe-grid doe-grid--2">
        <div className="doe-field">
          <label>Height (m)</label>
          <input
            type="number"
            className="inp"
            value={altDisplay}
            step={0.1}
            onChange={e => {
              const v = Number(e.target.value)
              if (Number.isFinite(v)) onAlt(v)
            }}
          />
        </div>
        {onSnapToTerrain && (
          <div className="doe-field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="doe-terrain-btn"
              title="Snap to terrain height at this lon/lat"
              onClick={onSnapToTerrain}
            >
              <svg viewBox="0 0 16 16" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12l3-4 2.5 2L11 5l3 4" />
                <line x1="8" y1="12" x2="8" y2="14.5" />
                <line x1="6.5" y1="14.5" x2="9.5" y2="14.5" />
              </svg>
              Terrain
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
