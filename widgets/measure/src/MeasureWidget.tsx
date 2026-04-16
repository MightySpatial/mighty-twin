import type { WidgetComponentProps } from '@mightyspatial/widget-host'
import { useMeasure } from './useMeasure'
import { formatArea, formatDistance } from './measureUtils'
import styles from './MeasureWidget.module.css'

/**
 * Measure widget UI. Self-contained: it reads the Cesium viewer from
 * `@mightyspatial/cesium-core`, owns its own tool lifecycle via useMeasure,
 * and renders the toolbar, live tooltip, and result panel.
 *
 * When ctx.displayMode is 'compact' (e.g. rendered inside a side pane), the
 * widget tightens its layout: shorter button labels and inline result rows.
 */
export function MeasureWidget({ ctx, onClose }: WidgetComponentProps) {
  const {
    measureActive,
    measureRunning,
    measureResult,
    startMeasure,
    cancelMeasure,
    clearResult,
  } = useMeasure()

  const compact = ctx.displayMode === 'compact'

  return (
    <div
      className={`${styles.widget} ${compact ? styles.widgetCompact : ''}`}
      data-widget="measure"
      data-display-mode={ctx.displayMode ?? 'full'}
    >
      <div className={styles.toolbar}>
        {!measureActive && !measureResult && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={startMeasure}
            aria-label="Start measurement"
          >
            {compact ? 'Start' : 'Start measuring'}
          </button>
        )}
        {measureActive && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonDanger}`}
            onClick={cancelMeasure}
            aria-label="Cancel measurement"
          >
            Cancel
          </button>
        )}
        {measureResult && (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={startMeasure}
              aria-label="Start another measurement"
            >
              {compact ? 'New' : 'New measurement'}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={clearResult}
              aria-label="Clear measurement"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {measureActive && (
        <div className={styles.tooltip} role="status" aria-live="polite">
          {measureRunning ? (
            <>
              <span className={styles.tooltipDist}>
                {formatDistance(measureRunning.distance)}
              </span>
              <span className={styles.tooltipHint}>
                {measureRunning.points} point{measureRunning.points !== 1 ? 's' : ''}
                {compact ? ' — dbl-click' : ' — double-click to finish'}
              </span>
            </>
          ) : (
            <span className={styles.tooltipHint}>
              {compact
                ? 'Click to place points. ESC to cancel.'
                : 'Click on the globe to place points. ESC to cancel.'}
            </span>
          )}
        </div>
      )}

      {measureResult && (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <span>Measurement</span>
            <button
              type="button"
              className={styles.resultClose}
              onClick={() => {
                clearResult()
                onClose()
              }}
              aria-label="Close measurement"
            >
              ×
            </button>
          </div>
          <div className={styles.resultBody}>
            <div className={styles.resultRow}>
              <span className={styles.resultLabel}>{compact ? 'Dist' : 'Distance'}</span>
              <span className={styles.resultValue}>
                {formatDistance(measureResult.distance)}
              </span>
            </div>
            {measureResult.area > 0 && (
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>Area</span>
                <span className={styles.resultValue}>{formatArea(measureResult.area)}</span>
              </div>
            )}
            <div className={styles.resultRow}>
              <span className={styles.resultLabel}>{compact ? 'Pts' : 'Points'}</span>
              <span className={styles.resultValue}>{measureResult.points}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
