/**
 * @mightyspatial/cesium-core
 *
 * Cesium viewer wrapper, React hooks, and picking helpers. Every first-party
 * Mighty widget reads the Cesium viewer through these exports, so host apps
 * control how the viewer is constructed and there is one source of truth for
 * camera state, basemaps, and picking.
 */

export {
  CesiumProvider,
  useViewer,
  useViewerRef,
  useViewerReady,
} from './CesiumProvider'

export { useCameraState } from './hooks/useCameraState'
export type { CameraSnapshot } from './hooks/useCameraState'

export { useGlobePicker } from './hooks/useGlobePicker'
export type { GlobePickResult } from './hooks/useGlobePicker'

export { basemaps, defaultBasemap } from './basemaps'
export type { BasemapPreset } from './basemaps'
