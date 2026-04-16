import { formatDistance, formatArea } from './measureUtils'
import type { MeasureResult } from './types'

interface MeasureWidgetProps {
  measureActive: boolean
  measureRunning: { distance: number; points: number } | null
  measureResult: MeasureResult | null
  onCleanup: () => void
  onClearResult: () => void
}

export default function MeasureWidget({
  measureActive,
  measureRunning,
  measureResult,
  onCleanup,
  onClearResult,
}: MeasureWidgetProps) {
  return (
    <>
      {/* Measure running tooltip */}
      {measureActive && measureRunning && (
        <div className="measure-tooltip">
          <span className="measure-tooltip-dist">{formatDistance(measureRunning.distance)}</span>
          <span className="measure-tooltip-hint">
            {measureRunning.points} point{measureRunning.points !== 1 ? 's' : ''} — double-click to finish
          </span>
        </div>
      )}
      {measureActive && !measureRunning && (
        <div className="measure-tooltip">
          <span className="measure-tooltip-hint">Click on the globe to place points. ESC to cancel.</span>
        </div>
      )}

      {/* Measure result */}
      {measureResult && (
        <div className="measure-result">
          <div className="measure-result-header">
            <span>Measurement</span>
            <button className="ext-panel-close" onClick={() => { onCleanup(); onClearResult() }}>×</button>
          </div>
          <div className="measure-result-body">
            <div className="measure-result-row">
              <span className="measure-result-label">Distance</span>
              <span className="measure-result-value">{formatDistance(measureResult.distance)}</span>
            </div>
            {measureResult.area > 0 && (
              <div className="measure-result-row">
                <span className="measure-result-label">Area</span>
                <span className="measure-result-value">{formatArea(measureResult.area)}</span>
              </div>
            )}
            <div className="measure-result-row">
              <span className="measure-result-label">Points</span>
              <span className="measure-result-value">{measureResult.points}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
