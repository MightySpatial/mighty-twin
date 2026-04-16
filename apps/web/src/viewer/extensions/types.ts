/**
 * MightyTwin — Extension Interface
 * Extensions are self-contained modules that plug into the viewer.
 * The core app works without any extensions installed.
 */
import type { Viewer as CesiumViewer } from 'cesium'
import type { Layer } from '../components/CesiumViewer'

export interface ViewerContext {
  siteId: string
  getSiteConfig: (key: string) => unknown
  setSiteConfig: (key: string, value: unknown) => void
}

export interface LayerHandle {
  update: (layer: Layer) => void
  setVisible: (visible: boolean) => void
  setOpacity: (opacity: number) => void
  destroy: () => void
}

export interface PanelProps {
  viewer: CesiumViewer
  context: ViewerContext
  onClose: () => void
}

export interface MightyTwinExtension {
  id: string
  name: string
  version: string

  // Called once when viewer is ready
  onViewerReady?: (viewer: CesiumViewer, context: ViewerContext) => void

  // Layer rendering — return true to claim this layer
  claimsLayer?: (layer: Layer) => boolean
  renderLayer?: (layer: Layer, viewer: CesiumViewer, context: ViewerContext) => LayerHandle

  // Optional toolbar panel(s) — one extension can contribute multiple
  panel?: {
    icon: React.ReactNode
    label: string
    component: React.ComponentType<PanelProps>
  }
  panels?: Array<{
    id: string
    icon: React.ReactNode
    label: string
    component: React.ComponentType<PanelProps>
  }>

  // Called when extension is unloaded
  onUnload?: (viewer: CesiumViewer) => void
}

// Extension registry
const extensions: MightyTwinExtension[] = []

export function registerExtension(ext: MightyTwinExtension) {
  if (!extensions.find(e => e.id === ext.id)) {
    extensions.push(ext)
  }
}

export function getExtensions(): MightyTwinExtension[] {
  return extensions
}

export function getExtensionPanels() {
  const result: Array<{ id: string; label: string; icon: React.ReactNode; component: React.ComponentType<PanelProps> }> = []
  extensions.forEach(e => {
    // Single panel shorthand
    if (e.panel) {
      result.push({ id: e.id, label: e.panel.label, icon: e.panel.icon, component: e.panel.component })
    }
    // Multi-panel
    if (e.panels) {
      e.panels.forEach(p => result.push({ id: `${e.id}:${p.id}`, label: p.label, icon: p.icon, component: p.component }))
    }
  })
  return result
}

export function findLayerRenderer(layer: Layer): MightyTwinExtension | null {
  return extensions.find(e => e.claimsLayer?.(layer)) ?? null
}
