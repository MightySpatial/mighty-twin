import type { ComponentType, ReactNode } from 'react'

/** All supported view modes. Derived from the URL. */
export type ViewMode =
  | 'viewer-only'
  | 'admin-only'
  | 'split-viewer'
  | 'split-admin'
  | 'settings'

export type Breakpoint = 'phone' | 'tablet' | 'desktop'

/** Display hint the shell passes to widgets via WidgetContext. */
export type DisplayMode = 'full' | 'compact'

export type PaneRole = 'primary' | 'side' | null

export interface ShellContextValue {
  mode: ViewMode
  breakpoint: Breakpoint
  /** The display mode for the pane the current component is inside. */
  displayMode: DisplayMode
  /** Programmatically change view mode. Uses push/replace per transition rules. */
  setMode: (mode: ViewMode) => void
  /** Live size of the pane this consumer is rendered inside. */
  paneSize: { width: number; height: number }
  /** Pane role for the current tree. null for non-pane contexts. */
  paneRole: PaneRole
}

export interface BrandProps {
  name: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onClick?: () => void
}

export interface AppShellProps {
  brand: BrandProps

  /** The viewer surface. Rendered once and never unmounted — the shell clips it
   *  via CSS across view modes. Pass null for apps without a viewer. */
  viewer: ReactNode | null

  /** Rendered conditionally when admin is visible (admin-only, split modes, phone). */
  adminContent: ReactNode

  /** Rendered conditionally when settings is visible. */
  settingsContent: ReactNode

  /** Labels shown in the top bar. Defaults: Viewer / Admin / Settings. */
  tabLabels?: { viewer?: string; admin?: string; settings?: string }

  /** Side-pane width in desktop split mode. Default 420. */
  sidePaneWidth?: number

  /** Tablet drawer width. Default 320. */
  drawerWidth?: number

  /** Default mode when URL is bare. Default 'viewer-only'. */
  defaultMode?: ViewMode

  /** Emitted after mode changes (telemetry hook). */
  onModeChange?: (mode: ViewMode) => void
}
