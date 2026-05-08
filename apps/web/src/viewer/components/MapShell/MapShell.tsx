/** MapShell — Phase L chrome around the Cesium viewer.
 *
 *  This component renders the new map-layout chrome (site chip, zoom
 *  column, nav gimbal, bottom widget rails) as positioned overlays on
 *  top of the Cesium canvas. It does NOT replace the existing widget
 *  popups (search, measure, basemap, layers, etc.) — those keep
 *  rendering inside CesiumViewer where their state hooks live.
 *
 *  Wires:
 *    - Buttons in the bottom rails dispatch via the `onAction(id)`
 *      callback so CesiumViewer (or whoever renders MapShell) decides
 *      what each tool does. Keeps state-ownership where it already lives.
 *    - The site chip is a click-to-popover pattern (popover stub for
 *      now; the real picker lives in a downstream commit).
 *    - The gimbal is a click-to-reset (north + level) — invokes
 *      onResetCamera if provided.
 *    - The viewer instance ref is read for the gimbal compass arrow so
 *      it actually rotates with the camera (passed via prop).
 *
 *  Public viewer mode (Phase M): when ``publicMode`` is true, the
 *  rails are filtered to widgets with ``publicVisible: true`` only.
 */

import { useMemo, useRef, useState } from 'react'
import {
  Layers as LayersIcon,
  List as ListIcon,
  Search as SearchIcon,
  Ruler,
  Camera as CameraIcon,
  Hexagon,
  Table as TableIcon,
  BookOpen,
  Slash,
  Mountain,
  ZoomIn,
  ZoomOut,
  Home as HomeIcon,
  Square,
  Globe,
  Map as MapIcon,
  LayoutGrid as ToolsIcon,
} from 'lucide-react'

import {
  DEFAULT_WIDGETS,
  applyWidgetOverrides,
  publicWidgets,
  widgetsForController,
  type WidgetDef,
  type WidgetOverrides,
} from './widgetRegistry'
import styles from './MapShell.module.css'

type IconComponent = React.ComponentType<{ size?: number | string }>
const ICON_MAP: Record<string, IconComponent> = {
  Layers: LayersIcon as IconComponent,
  List: ListIcon as IconComponent,
  Search: SearchIcon as IconComponent,
  Ruler: Ruler as IconComponent,
  Camera: CameraIcon as IconComponent,
  Hexagon: Hexagon as IconComponent,
  Table: TableIcon as IconComponent,
  BookOpen: BookOpen as IconComponent,
  Slash: Slash as IconComponent,
  Mountain: Mountain as IconComponent,
}

export interface MapShellProps {
  /** Currently displayed site — passed through for public banner / future chip.
   *  The site chip itself now lives in ViewerSidebar. */
  site?: { slug: string; name: string; subtitle?: string } | null
  /** Active tool id (matches WidgetDef.id) — used to highlight the rail. */
  activeToolId: string | null
  /** Click handler for any rail tile. id is the WidgetDef.id. */
  onAction: (id: string) => void
  /** Camera control hooks owned by the parent. */
  onZoomIn: () => void
  onZoomOut: () => void
  onHome: () => void
  onToggle2D3D: () => void
  onToggleBasemap: () => void
  onResetCamera?: () => void
  /** Long-press on compass — toggles first-person look-around mode. */
  onToggleLookAround?: () => void
  /** True when look-around mode is active (gimbal turns teal). */
  lookAroundActive?: boolean
  /** Site chip click — opens the site picker popover (impl out-of-scope). */
  onOpenSitePicker?: () => void
  /** Phase M: hide non-essential widgets when site is public-pre-login. */
  publicMode?: boolean
  /** Heading in degrees (0 = north) for the gimbal arrow. */
  headingDeg?: number
  /** Gimbal pitch hint — currently informational only. */
  pitchDeg?: number
  /** True when the viewer is in 2D mode (toggle button reflects target). */
  is2D?: boolean
  /** Show the public banner (only when publicMode + not authenticated). */
  showPublicBanner?: boolean
  /** When true, force the phone-mode chrome (Tools FAB instead of rails,
   *  compact site chip, etc.) regardless of viewport width. The host app's
   *  ShellContext breakpoint should drive this. */
  phoneMode?: boolean
  /** Workspace widget overrides — disabled widgets get filtered out, and
   *  controller/position changes get merged in. Pass null/undefined to
   *  fall back to DEFAULT_WIDGETS unchanged. */
  widgetOverrides?: WidgetOverrides | null
  /** Extra render slot for floating overlays (feature popup etc.) */
  children?: React.ReactNode
}

export function MapShell({
  site,
  activeToolId,
  onAction,
  onZoomIn,
  onZoomOut,
  onHome,
  onToggle2D3D,
  onToggleBasemap,
  onResetCamera,
  onToggleLookAround,
  lookAroundActive = false,
  onOpenSitePicker,
  publicMode = false,
  headingDeg = 0,
  is2D = false,
  showPublicBanner = false,
  phoneMode = false,
  widgetOverrides = null,
  children,
}: MapShellProps) {
  // Long-press detection for gimbal → look-around
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleGimbalPointerDown = () => {
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      onToggleLookAround?.()
    }, 500)
  }
  const handleGimbalPointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      // Short press → reset north
      onResetCamera?.()
    }
  }
  const handleGimbalPointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const widgets = useMemo<WidgetDef[]>(() => {
    const base = publicMode ? publicWidgets(DEFAULT_WIDGETS) : DEFAULT_WIDGETS
    return applyWidgetOverrides(base, widgetOverrides)
  }, [publicMode, widgetOverrides])
  const primary = useMemo(() => widgetsForController(widgets, 'primary'), [widgets])
  const secondary = useMemo(() => widgetsForController(widgets, 'secondary'), [widgets])

  // Phone-only: tools sheet open/closed.
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div
      className={`${styles.shell} ${phoneMode ? styles.shellPhone : ''}`}
      aria-hidden="false"
    >
      {/* Top-left bar.
          Desktop: nav buttons only (site chip lives in sidebar ribbon).
          Mobile: site chip only (nav buttons hidden; pinch-to-zoom + tools sheet replaces them). */}
      <div className={styles.topBar}>
        {/* Site chip — only visible on phone (desktop sidebar already shows it) */}
        {site && (
          <button
            type="button"
            className={`${styles.siteChip} ${styles.siteChipMobile}`}
            onClick={onOpenSitePicker}
            title={`Switch site — ${site.name}`}
          >
            <span className={styles.siteChipIcon}>
              {site.name.slice(0, 1).toUpperCase()}
            </span>
            <span className={styles.siteChipName}>{site.name}</span>
          </button>
        )}
        {/* Divider between chip and nav buttons (desktop only; both sides visible) */}
        {site && <div className={`${styles.barDiv} ${styles.barDivDesktop}`} />}
        <button className={styles.barBtn} onClick={onZoomIn} title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button className={styles.barBtn} onClick={onZoomOut} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <div className={styles.barDiv} />
        <button className={styles.barBtn} onClick={onHome} title="Home">
          <HomeIcon size={16} />
        </button>
        <button
          className={`${styles.barBtn} ${is2D ? styles.active : ''}`}
          onClick={onToggle2D3D}
          title={is2D ? 'Switch to 3D' : 'Switch to 2D'}
        >
          {is2D ? <Globe size={16} /> : <Square size={16} />}
        </button>
        <button className={styles.barBtn} onClick={onToggleBasemap} title="Basemap">
          <MapIcon size={16} />
        </button>
      </div>

      {/* Compact needle compass — tap = face north, hold = look-around mode */}
      <button
        type="button"
        className={`${styles.gimbal} ${lookAroundActive ? styles.gimbalActive : ''}`}
        onPointerDown={handleGimbalPointerDown}
        onPointerUp={handleGimbalPointerUp}
        onPointerLeave={handleGimbalPointerLeave}
        title={lookAroundActive ? 'Look-around ON — tap to exit' : 'Tap: face north · Hold: look around'}
      >
        <svg viewBox="0 0 36 36" width="36" height="36">
          <g transform={`rotate(${headingDeg} 18 18)`}>
            {/* North needle — teal (brighter when look-around active) */}
            <polygon points="18,5 15,18 21,18" fill={lookAroundActive ? '#ffffff' : '#2dd4bf'} />
            {/* South needle — muted */}
            <polygon points="18,31 15,18 21,18" fill="rgba(240,242,248,0.28)" />
          </g>
          {/* Centre dot */}
          <circle cx="18" cy="18" r="2.5" fill="rgba(240,242,248,0.7)" />
        </svg>
      </button>

      {showPublicBanner && (
        <div className={styles.publicBanner}>
          Public site
          <button type="button" onClick={() => (window.location.href = '/')}>
            Sign in
          </button>
        </div>
      )}

      {/* Only the secondary rail lives at the bottom.
          Primary widgets (Search, Measure, Layers, Legend) are in the sidebar. */}
      {!publicMode && secondary.length > 0 && (
        <div className={styles.rails}>
          <div className={`${styles.rail} ${styles.railSecondary} ${styles.railScrollable}`}>
            {secondary.map((w) => (
              <RailTile
                key={w.id}
                widget={w}
                active={activeToolId === w.id}
                onClick={() => onAction(w.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Phone — Tools FAB substitutes for the bottom rails. Opens a
          slide-up sheet with all widgets in a 4-column grid. */}
      <button
        type="button"
        className={styles.toolsFab}
        aria-label="Tools"
        onClick={() => setToolsOpen(true)}
      >
        <ToolsIcon size={22} />
      </button>
      {toolsOpen && (
        <div
          className={styles.toolsSheetBackdrop}
          onClick={() => setToolsOpen(false)}
        >
          <div className={styles.toolsSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.toolsSheetHandle} />
            {/* Primary tools — exclude Layers (accessible via sidebar on desktop,
                and via the dedicated Layers FAB on mobile) */}
            {primary.filter(w => w.id !== 'layers').length > 0 && (
              <div className={styles.toolsSheetSection}>
                <div className={styles.toolsSheetSectionLabel}>Tools</div>
                <div className={styles.toolsSheetGrid}>
                  {primary.filter(w => w.id !== 'layers').map((w) => (
                    <SheetTile
                      key={w.id}
                      widget={w}
                      active={activeToolId === w.id}
                      onClick={() => {
                        onAction(w.id)
                        setToolsOpen(false)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {!publicMode && secondary.length > 0 && (
              <div className={styles.toolsSheetSection}>
                <div className={styles.toolsSheetSectionLabel}>Widgets</div>
                <div className={styles.toolsSheetGrid}>
                  {secondary.map((w) => (
                    <SheetTile
                      key={w.id}
                      widget={w}
                      active={activeToolId === w.id}
                      onClick={() => {
                        onAction(w.id)
                        setToolsOpen(false)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  )
}

function SheetTile({
  widget,
  active,
  onClick,
}: {
  widget: WidgetDef
  active: boolean
  onClick: () => void
}) {
  const Icon = ICON_MAP[widget.icon]
  return (
    <button
      type="button"
      className={`${styles.toolsSheetTile} ${active ? styles.active : ''}`}
      onClick={onClick}
    >
      {Icon ? <Icon size={20} /> : null}
      {widget.label}
    </button>
  )
}

function RailTile({
  widget,
  active,
  onClick,
}: {
  widget: WidgetDef
  active: boolean
  onClick: () => void
}) {
  const Icon = ICON_MAP[widget.icon]
  return (
    <button
      type="button"
      className={`${styles.tile} ${active ? styles.active : ''}`}
      onClick={onClick}
      title={`${widget.label} · ${widget.loadMode}`}
    >
      {Icon ? <Icon size={18} /> : null}
      {widget.label}
    </button>
  )
}

/** Customer-brand slot for the app shell topbar. Renders the
 *  complementary hierarchy: client primary, "by Mighty" minor when set. */
export interface CustomerBrand {
  name: string
  initials: string
  /** Two-stop linear gradient hex pair, e.g. ['#f97316', '#ef4444']. */
  gradient?: [string, string]
}

export function BrandZone({ customer }: { customer?: CustomerBrand | null }) {
  if (!customer) {
    return (
      <div className={styles.brandZone}>
        <div className={styles.customerBrand}>
          <span
            className={styles.customerMark}
            style={{ background: 'linear-gradient(135deg, #2453ff, #a78bfa)' }}
          >
            M
          </span>
          <span className={styles.customerName}>MightyTwin</span>
        </div>
      </div>
    )
  }
  const [g0, g1] = customer.gradient ?? ['#2453ff', '#a78bfa']
  return (
    <div className={styles.brandZone}>
      <div className={styles.customerBrand}>
        <span
          className={styles.customerMark}
          style={{ background: `linear-gradient(135deg, ${g0}, ${g1})` }}
        >
          {customer.initials}
        </span>
        <span className={styles.customerName}>{customer.name}</span>
      </div>
      <div className={styles.poweredBy}>
        <span className={styles.mightyDot} />
        <span>Mighty</span>
      </div>
    </div>
  )
}
