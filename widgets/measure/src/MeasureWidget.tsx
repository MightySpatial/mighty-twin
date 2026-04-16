import type { WidgetComponentProps } from '@mightyspatial/widget-host'
import { useMeasure } from './useMeasure'
import { formatArea, formatDistance } from './measureUtils'
import styles from './MeasureWidget.module.css'

/**
 * Measure widget UI. Self-contained: it reads the Cesium viewer from
 * `@mightyspatial/cesium-core`, owns its own tool lifecycle via useMeasure,
 * and renders the toolbar, live tooltip, and result panel.
 */
export function MeasureWidget({ onClose }: WidgetComponentProps) {
  const {
    measureActive,
    measureRunning,
    measureResult,
    startMeasure,
    cancelMeasure,
    clearResult,
  } = useMeasure()

  return (
    <div className={styles.widget} data-widget="measure">
      <div className={styles.toolbar}>
        {!measureActive && !measureResult && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={startMeasure}
            aria-label="Start measurement"
          >
            Start measuring
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
              New measurement
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
                {measureRunning.points} point{measureRunning.points !== 1 ? 's' : ''} — double-click to finish
              </span>
            </>
          ) : (
            <span className={styles.tooltipHint}>
              Click on the globe to place points. ESC to cancel.
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
              <span className={styles.resultLabel}>Distance</span>
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
              <span className={styles.resultLabel}>Points</span>
              <span className={styles.resultValue}>{measureResult.points}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
