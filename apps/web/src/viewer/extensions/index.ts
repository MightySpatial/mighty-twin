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

import './pipes'

import './design'

// Future extensions (uncomment when ready):
// import './measure'
// import './symbology-templates'
// import './strike-zones'
// import './ifc-import'
// import './story-map-editor'
// import './feature-editing'

export { getExtensions, getExtensionPanels, findLayerRenderer } from './types'
