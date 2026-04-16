/**
 * @mightyspatial/widget-measure — distance and area on the Cesium globe.
 *
 * Register with a host app:
 *     import { register } from '@mightyspatial/widget-measure'
 *     register()
 */

export { MeasureWidget } from './MeasureWidget'
export { useMeasure } from './useMeasure'
export { measureManifest, register } from './register'
export {
  computePolylineDistance,
  computePolygonArea,
  formatDistance,
  formatArea,
} from './measureUtils'
export type { MeasureResult, MeasureRunning } from './types'
