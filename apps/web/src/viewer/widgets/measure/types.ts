export type MeasureMode = 'line' | 'area' | 'point'

export interface PointMeasurement {
  longitude: number
  latitude: number
  height: number
}

export interface MeasureResult {
  mode: MeasureMode
  distance: number
  area: number
  points: number
  segments?: number[]
  point?: PointMeasurement
}
