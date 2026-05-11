import {
  formatDistance,
  formatArea,
  formatLatitude,
  formatLongitude,
  formatElevation,
} from './measureUtils'
import type { MeasureMode, MeasureResult } from './types'

interface MeasureWidgetProps {
  measureMode: MeasureMode
  onModeChange: (mode: MeasureMode) => void
  measureActive: boolean
  measureRunning: { distance: number; points: number } | null
  measureResult: MeasureResult | null
  onCleanup: () => void
  onClearResult: () => void
  /** 'floating' (default) anchors at the canvas bottom; 'inline' fills
   *  its parent (used by the RightPane tab content). */
  mode?: 'floating' | 'inline'
}

const MODES: { id: MeasureMode; label: string }[] = [
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'point', label: 'Point' },
]

function ModeTabs({
  active,
  onChange,
}: { active: MeasureMode; onChange: (m: MeasureMode) => void }) {
  return (
    <div className="measure-mode-tabs" role="tablist" aria-label="Measurement mode">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={active === m.id}
          className={`measure-mode-tab${active === m.id ? ' measure-mode-tab--active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function runningHint(mode: MeasureMode, running: { points: number } | null): string {
  if (mode === 'point') return 'Click anywhere on the globe to capture a point.'
  if (!running || running.points === 0) {
    return mode === 'line'
      ? 'Click to place line points. Double-click or Enter to finish.'
      : 'Click to outline a polygon. Double-click or Enter to close.'
  }
  const pts = `${running.points} pt${running.points !== 1 ? 's' : ''}`
  return mode === 'line'
    ? `${pts} — double-click or Enter to finish · Esc to cancel`
    : `${pts} — double-click or Enter to close · Esc to cancel`
}

function ResultBody({ result }: { result: MeasureResult }) {
  if (result.mode === 'point' && result.point) {
    const p = result.point
    return (
      <>
        <div className="measure-result-row">
          <span className="measure-result-label">Latitude</span>
          <span className="measure-result-value">{formatLatitude(p.latitude)}</span>
        </div>
        <div className="measure-result-row">
          <span className="measure-result-label">Longitude</span>
          <span className="measure-result-value">{formatLongitude(p.longitude)}</span>
        </div>
        <div className="measure-result-row">
          <span className="measure-result-label">Elevation</span>
          <span className="measure-result-value">{formatElevation(p.height)}</span>
        </div>
      </>
    )
  }
  if (result.mode === 'area') {
    return (
      <>
        <div className="measure-result-row">
          <span className="measure-result-label">Area</span>
          <span className="measure-result-value">{formatArea(result.area)}</span>
        </div>
        <div className="measure-result-row">
          <span className="measure-result-label">Perimeter</span>
          <span className="measure-result-value">{formatDistance(result.distance)}</span>
        </div>
        <div className="measure-result-row">
          <span className="measure-result-label">Vertices</span>
          <span className="measure-result-value">{result.points}</span>
        </div>
      </>
    )
  }
  // line
  const segs = result.segments ?? []
  const segCount = segs.length > 0 ? segs.length : Math.max(0, result.points - 1)
  return (
    <>
      <div className="measure-result-row">
        <span className="measure-result-label">Total</span>
        <span className="measure-result-value">{formatDistance(result.distance)}</span>
      </div>
      <div className="measure-result-row">
        <span className="measure-result-label">Segments</span>
        <span className="measure-result-value">{segCount}</span>
      </div>
      {segs.length > 1 && (
        <div className="measure-result-segments">
          {segs.map((s, i) => (
            <div key={i} className="measure-result-segment">
              <span className="measure-result-segment-label">#{i + 1}</span>
              <span className="measure-result-segment-value">{formatDistance(s)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function resultLabel(mode: MeasureMode): string {
  if (mode === 'area') return 'Area Measurement'
  if (mode === 'point') return 'Point'
  return 'Line Measurement'
}

export default function MeasureWidget({
  measureMode,
  onModeChange,
  measureActive,
  measureRunning,
  measureResult,
  onCleanup,
  onClearResult,
  mode = 'floating',
}: MeasureWidgetProps) {
  const inline = mode === 'inline'
  const closeResult = () => { onCleanup(); onClearResult() }

  if (inline) {
    return (
      <div className="measure-inline">
        <ModeTabs active={measureMode} onChange={onModeChange} />
        {measureActive && (
          <div className="measure-inline-running">
            {measureMode !== 'point' && measureRunning && measureRunning.points > 0 && (
              <span className="measure-tooltip-dist">{formatDistance(measureRunning.distance)}</span>
            )}
            <span className="measure-tooltip-hint">
              {runningHint(measureMode, measureRunning)}
            </span>
          </div>
        )}
        {!measureActive && !measureResult && (
          <div className="measure-inline-idle">
            <span className="measure-tooltip-hint">
              {measureMode === 'point'
                ? 'Click on the globe to capture lat / lon / elevation.'
                : measureMode === 'line'
                  ? 'Place points along a path to measure its length.'
                  : 'Outline a polygon to measure its area + perimeter.'}
            </span>
          </div>
        )}
        {measureResult && (
          <div className="measure-result measure-result--inline">
            <div className="measure-result-header">
              <span>{resultLabel(measureResult.mode)}</span>
              <button
                type="button"
                className="ext-panel-close"
                onClick={closeResult}
                aria-label="Clear measurement"
              >×</button>
            </div>
            <div className="measure-result-body">
              <ResultBody result={measureResult} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Floating (canvas overlay)
  return (
    <>
      {measureActive && (
        <div className="measure-tooltip">
          <ModeTabs active={measureMode} onChange={onModeChange} />
          {measureMode !== 'point' && measureRunning && measureRunning.points > 0 && (
            <span className="measure-tooltip-dist">{formatDistance(measureRunning.distance)}</span>
          )}
          <span className="measure-tooltip-hint">
            {runningHint(measureMode, measureRunning)}
          </span>
        </div>
      )}
      {measureResult && (
        <div className="measure-result">
          <div className="measure-result-header">
            <span>{resultLabel(measureResult.mode)}</span>
            <button
              type="button"
              className="ext-panel-close"
              onClick={closeResult}
              aria-label="Clear measurement"
            >×</button>
          </div>
          <div className="measure-result-body">
            <ResultBody result={measureResult} />
          </div>
        </div>
      )}
    </>
  )
}
