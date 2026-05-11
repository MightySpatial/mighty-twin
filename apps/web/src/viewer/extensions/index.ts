/**
 * MightyTwin — Registered Extensions
 * Import extensions here to activate them.
 * Comment out to disable.
 */

// Core extensions (ship with MightyTwin)
// Note: underground used to register here; the canonical surface is
// now the Underground tab inside the Terrain rail widget (T+1230).
// Leaving the extension file in place for reference but no longer
// loaded — keeps the panel-strip from showing two ways to reach
// the same controls.

// Pipes extension removed — pipe depth modes are now handled inside the
// Design widget (layer metadata / renderAs controls). Keep the extension
// file for reference but don't register it.
// import './pipes'

// Design moved out of the left sidebar — it now mounts as a right-side
// overlay opened from the bottom rail. See CesiumViewer.tsx (`designOpen`).

// Future extensions (uncomment when ready):
// import './measure'
// import './symbology-templates'
// import './ifc-import'
// import './story-map-editor'
// import './feature-editing'

export { getExtensions, getExtensionPanels, findLayerRenderer } from './types'
