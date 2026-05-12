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

import { useMemo, useRef } from 'react'
import {
  Layers as LayersIcon,
  List as ListIcon,
  Search as SearchIcon,
  Ruler,
  Camera as CameraIcon,
  Hexagon,
  Table as TableIcon,
  BookOpen,
  Mountain,
  Plane,
  Globe2,
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
import { Carousel } from './Carousel'
import { CtrlPill } from '../CtrlPill/CtrlPill'

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
  Mountain: Mountain as IconComponent,
  Plane: Plane as IconComponent,
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
  /** Navigate back to the all-sites overview. When set + a site is
   *  loaded, the widget rail prepends a violet Overview tile (§3.5 of
   *  the implementation brief). */
  onNavigateOverview?: () => void
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
  onNavigateOverview,
  children,
}: MapShellProps) {
  // Hold-to-look-around on the compass:
  //   pointerdown → start look-around immediately
  //   pointerup   → detected globally (parent wires window listener), restores orbit
  //   short tap (no drag) → treated as reset-north by the parent
  const pointerDownTime = useRef<number>(0)

  const handleGimbalPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerDownTime.current = Date.now()
    onToggleLookAround?.()   // parent immediately enables look mode + wires pointerup cleanup
  }
  // pointerup on the button fires when released (even after drag, because of capture)
  const handleGimbalPointerUp = () => {
    const held = Date.now() - pointerDownTime.current
    // Parent's window pointerup listener already stopped look-around.
    // If it was a quick tap (< 250 ms, no real drag), also reset north.
    if (held < 250) {
      onResetCamera?.()
    }
  }

  const widgets = useMemo<WidgetDef[]>(() => {
    const base = publicMode ? publicWidgets(DEFAULT_WIDGETS) : DEFAULT_WIDGETS
    const withOverrides = applyWidgetOverrides(base, widgetOverrides)
    // Fly locomotion needs WASD/arrows/Q/E — drop it from the rail and
    // tools sheet on phones where there's no physical keyboard.
    return phoneMode ? withOverrides.filter((w) => w.id !== 'fly') : withOverrides
  }, [publicMode, widgetOverrides, phoneMode])
  const secondary = useMemo(() => widgetsForController(widgets, 'secondary'), [widgets])

  // The tools-open / tools-close window events were tied to the
  // retired Tools FAB sheet. Mai's clearance is now governed by the
  // permanent bottom widget rail (defaultFabPos.y already reserves
  // 142px so it doesn't overlap).

  return (
    <div
      className={`${styles.shell} ${phoneMode ? `${styles.shellPhone} is-phone` : ''}`}
      aria-hidden="false"
    >
      {/* Primary controller pill — site chip + camera controls.
          One component across every form factor; the brief mandates
          the same chrome on phone, tablet portrait/landscape, and
          desktop (see §3.1 of mockups/IMPLEMENTATION.md). */}
      <CtrlPill
        currentSite={site ? { slug: site.slug, name: site.name } : null}
        onSiteChipClick={onOpenSitePicker}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onHome={onHome}
        onToggle2D3D={onToggle2D3D}
        is2D={is2D}
        onBasemapClick={onToggleBasemap}
      />

      {/* Compact needle compass — tap = face north, hold = look-around mode */}
      <button
        type="button"
        className={`${styles.gimbal} ${lookAroundActive ? styles.gimbalActive : ''}`}
        onPointerDown={handleGimbalPointerDown}
        onPointerUp={handleGimbalPointerUp}
        title={lookAroundActive ? 'Looking around — release to orbit' : 'Tap: face north · Hold + drag: look around'}
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

      {/* Secondary rail — bottom-centre on desktop, bottom on phone.
          Hosts Story / Snap / Design / Terrain / Fly. Each tile sets
          the right pane's active widget (or toggles fly active) via
          the parent's onAction handler — the pane is purely a content
          slot, the rail is the controller. Phones get the same rail
          plus a Tools FAB further below. */}
      {!publicMode && secondary.length > 0 && (
        <div className={styles.rails}>
          <SecondaryRail
            widgets={secondary}
            activeToolId={activeToolId}
            onAction={onAction}
            showOverviewTile={Boolean(site && onNavigateOverview)}
            onNavigateOverview={onNavigateOverview}
          />
        </div>
      )}

      {/* Tools FAB + slide-up sheet retired — the SecondaryRail above
          is now permanently visible on phone, so there's no need for
          a FAB indirection. */}

      {children}
    </div>
  )
}

/** Secondary rail — desktop bottom-centre widget controller. Renders
 *  a single-row carousel: tiles flow horizontally, chevron arrows
 *  appear only when there's overflow in that direction, and the
 *  underlying tiles fade into transparency beneath each arrow so the
 *  edge doesn't feel chopped. The Carousel primitive owns the scroll
 *  + measurement machinery so the same component drives the mobile
 *  tools-sheet WIDGETS row. */
function SecondaryRail({
  widgets,
  activeToolId,
  onAction,
  showOverviewTile,
  onNavigateOverview,
}: {
  widgets: WidgetDef[]
  activeToolId: string | null
  onAction: (id: string) => void
  showOverviewTile: boolean
  onNavigateOverview?: () => void
}) {
  return (
    <div className={`${styles.rail} ${styles.railSecondary}`}>
      <Carousel showArrows>
      {showOverviewTile && (
        <button
          key="__overview"
          type="button"
          className={styles.overviewTile}
          onClick={() => onNavigateOverview?.()}
          title="Back to all sites"
          aria-label="Back to all sites"
        >
          <Globe2 size={22} />
        </button>
      )}
      {widgets.map((w) => (
        <RailTile
          key={w.id}
          widget={w}
          active={activeToolId === w.id}
          onClick={() => onAction(w.id)}
        />
      ))}
      </Carousel>
    </div>
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
