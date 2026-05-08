/**
 * @mightyspatial/widget-host
 *
 * Contract and registry for first-party widgets in Mighty platform apps.
 * Widgets register a `WidgetManifest`; host apps iterate the registry to
 * render toolbar buttons, panels, and layer renderers.
 */

import type { ComponentType } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import type { Layer, Site, UserRole } from '@mightyspatial/types'

// ─── Context passed to every widget ─────────────────────────────────────────

/** Display hint from the host — widgets that have size-sensitive UI can
 *  consult this to pick between a full and a compact layout. */
export type DisplayMode = 'full' | 'compact'

/** User-facing formatting preferences, propagated by the host from persisted
 *  app settings. Widgets read these so values render in the user's chosen
 *  units without having to subscribe to settings themselves. */
export interface HostUnits {
  /** 'metric' (m, km, ha, km²) or 'imperial' (ft, mi, ac, mi²). */
  length: 'metric' | 'imperial'
  /** Decimal degrees, DMS, or MGRS for coordinate display. */
  coordinates: 'dd' | 'dms' | 'mgrs'
}

/** What a widget gets access to when it mounts. */
export interface WidgetContext {
  /** The live Cesium viewer. */
  viewer: CesiumViewer
  /** Current user, or null if anonymous. */
  user: WidgetUser | null
  /** Current site being viewed. */
  site: Site | null
  /** Per-widget config stored alongside the site. */
  config: Record<string, unknown>
  /** Typed fetch helper bound to the current auth context. */
  api: ApiClient
  /** UI helpers. */
  toast: (opts: ToastOptions) => void
  /** Host-provided hint about how much space the widget has.
   *  Widgets that don't care may ignore this. */
  displayMode?: DisplayMode
  /** Live size of the pane the widget is rendered inside. Updates on resize. */
  paneSize?: { width: number; height: number }
  /** User's unit/format preferences — optional to keep legacy hosts working;
   *  widgets default to metric + DD when absent. */
  units?: HostUnits
}

export interface WidgetUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface ApiClient {
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
  put<T = unknown>(path: string, body?: unknown): Promise<T>
  del<T = unknown>(path: string): Promise<T>
}

export interface ToastOptions {
  message: string
  level?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}

// ─── Layer handle returned by layer renderers ───────────────────────────────

/** Handle returned by a widget that claims a layer for rendering. */
export interface LayerHandle {
  update: (layer: Layer) => void
  setVisible: (visible: boolean) => void
  setOpacity: (opacity: number) => void
  destroy: () => void
}

// ─── Capabilities a widget can require ──────────────────────────────────────

export type Capability =
  | 'features:read'
  | 'features:write'
  | 'layers:temporary'
  | 'camera:control'
  | 'picking'
  | 'upload'

// ─── Widget manifest ────────────────────────────────────────────────────────

export type WidgetPlacement =
  | 'toolbar'
  | 'panel-left'
  | 'panel-right'
  | 'panel-bottom'
  | 'floating'
  | 'none' // widgets that only provide a layer renderer, no UI

export interface WidgetComponentProps {
  ctx: WidgetContext
  onClose: () => void
}

export interface WidgetManifest {
  /** Stable, kebab-case identifier. */
  id: string
  /** Human-readable name shown in the UI. */
  name: string
  /** Semver string. Exposed on the guide page for drift checks. */
  version: string
  /** Icon component (Lucide, heroicons, or custom) rendered in toolbars. */
  icon: ComponentType<{ size?: number; className?: string }>
  /** Where this widget mounts in the app shell. */
  placement: WidgetPlacement

  /** The widget's React component. */
  Component: ComponentType<WidgetComponentProps>

  /** Optional lifecycle hooks. */
  onActivate?: (ctx: WidgetContext) => void | Promise<void>
  onDeactivate?: (ctx: WidgetContext) => void | Promise<void>

  /** Optional layer renderer — return true from claimsLayer to own a layer type. */
  claimsLayer?: (layer: Layer) => boolean
  renderLayer?: (layer: Layer, ctx: WidgetContext) => LayerHandle

  /** Capabilities the host must grant for this widget to function. */
  requires?: readonly Capability[]

  /** Short description shown in the ux-guide index. Optional. */
  description?: string

  /** Minimum pane width the widget can render in. When the pane is narrower,
   *  the host hides the widget and shows a "widget hidden — expand pane"
   *  hint (so nothing silently vanishes). Leave unset for widgets that
   *  handle their own responsiveness. */
  minWidth?: number
}

// ─── Registry ───────────────────────────────────────────────────────────────

const registry: WidgetManifest[] = []

/** Register a widget. Idempotent — calling twice with the same id is a no-op. */
export function registerWidget(manifest: WidgetManifest): void {
  if (registry.some((w) => w.id === manifest.id)) return
  registry.push(manifest)
}

/** Return all registered widgets, optionally filtered. */
export function getWidgets(
  filter?: (manifest: WidgetManifest) => boolean,
): WidgetManifest[] {
  return filter ? registry.filter(filter) : [...registry]
}

/** Find the widget that claims a given layer, or null. */
export function findLayerRenderer(layer: Layer): WidgetManifest | null {
  return registry.find((w) => w.claimsLayer?.(layer)) ?? null
}

/** Clear the registry — only for tests. */
export function __clearRegistry(): void {
  registry.length = 0
}

// ─── Helpers for host apps ──────────────────────────────────────────────────

/** Widgets to render at a given placement. */
export function getWidgetsByPlacement(placement: WidgetPlacement): WidgetManifest[] {
  return getWidgets((w) => w.placement === placement)
}

/** Panels — convenience getter for toolbar-less placements.
 *
 * Returns the manifests directly so callers can render
 * `<m.icon size={18} />` themselves (JSX not used here to keep
 * this file .ts, not .tsx).
 */
export function getPanels(): WidgetManifest[] {
  return getWidgets((w) => w.placement.startsWith('panel-'))
}
