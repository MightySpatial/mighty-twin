export interface MeasureResult {
  /** Polyline distance in metres (sum of segment distances). */
  distance: number
  /** Polygon area in square metres; 0 if fewer than 3 points. */
  area: number
  /** Number of points the user placed. */
  points: number
}

export interface MeasureRunning {
  /** Current distance in metres. */
  distance: number
  /** Number of points placed so far. */
  points: number
}
