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

import { useMemo } from 'react'
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
} from 'lucide-react'

import {
  DEFAULT_WIDGETS,
  publicWidgets,
  widgetsForController,
  type WidgetDef,
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
  /** Currently displayed site — name + slug + brief context for the chip. */
  site: { slug: string; name: string; subtitle?: string } | null
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
  onOpenSitePicker,
  publicMode = false,
  headingDeg = 0,
  is2D = false,
  showPublicBanner = false,
  children,
}: MapShellProps) {
  const widgets = useMemo<WidgetDef[]>(
    () => (publicMode ? publicWidgets(DEFAULT_WIDGETS) : DEFAULT_WIDGETS),
    [publicMode],
  )
  const primary = useMemo(() => widgetsForController(widgets, 'primary'), [widgets])
  const secondary = useMemo(() => widgetsForController(widgets, 'secondary'), [widgets])

  return (
    <div className={styles.shell} aria-hidden="false">
      {site && (
        <button
          type="button"
          className={styles.siteChip}
          onClick={onOpenSitePicker}
          title="Site picker"
        >
          <span className={styles.siteChipIcon}>
            {site.name.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.siteChipMeta}>
            <span className={styles.siteChipName}>{site.name}</span>
            {site.subtitle ? (
              <span className={styles.siteChipSub}>{site.subtitle}</span>
            ) : null}
          </span>
          <span className={styles.siteChipChev}>▾</span>
        </button>
      )}

      <div className={styles.zoomCol}>
        <button className={styles.zoomBtn} onClick={onZoomIn} title="Zoom in">
          <ZoomIn size={18} />
        </button>
        <button className={styles.zoomBtn} onClick={onZoomOut} title="Zoom out">
          <ZoomOut size={18} />
        </button>
        <div className={styles.zoomDiv} />
        <button className={styles.zoomBtn} onClick={onHome} title="Home">
          <HomeIcon size={18} />
        </button>
        <button
          className={`${styles.zoomBtn} ${is2D ? styles.active : ''}`}
          onClick={onToggle2D3D}
          title={is2D ? 'Switch to 3D' : 'Switch to 2D'}
        >
          {is2D ? <Globe size={18} /> : <Square size={18} />}
        </button>
        <button className={styles.zoomBtn} onClick={onToggleBasemap} title="Basemap">
          <MapIcon size={18} />
        </button>
      </div>

      <button
        type="button"
        className={styles.gimbal}
        onClick={onResetCamera}
        title="Reset camera (click to face north + level)"
      >
        <svg viewBox="0 0 84 84">
          <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(240,242,248,0.18)" strokeWidth="1" />
          <circle cx="42" cy="42" r="30" fill="none" stroke="rgba(240,242,248,0.10)" strokeWidth="1" />
          <text x="42" y="14" textAnchor="middle" className={styles.gimbalText}>N</text>
          <text x="74" y="46" textAnchor="middle" className={styles.gimbalText}>E</text>
          <text x="42" y="78" textAnchor="middle" className={styles.gimbalText}>S</text>
          <text x="10" y="46" textAnchor="middle" className={styles.gimbalText}>W</text>
          <g transform={`rotate(${headingDeg} 42 42)`}>
            <polygon points="42,16 38,28 46,28" fill="#2dd4bf" />
            <polygon points="42,68 39,58 45,58" fill="rgba(240,242,248,0.5)" />
          </g>
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

      <div className={styles.rails}>
        {!publicMode && secondary.length > 0 && (
          <div className={`${styles.rail} ${styles.railSecondary}`}>
            {secondary.map((w) => (
              <RailTile
                key={w.id}
                widget={w}
                active={activeToolId === w.id}
                onClick={() => onAction(w.id)}
              />
            ))}
            <button className={styles.moreToggle}>More ▾</button>
          </div>
        )}
        <div className={`${styles.rail} ${styles.railPrimary}`}>
          {primary.map((w) => (
            <RailTile
              key={w.id}
              widget={w}
              active={activeToolId === w.id}
              onClick={() => onAction(w.id)}
            />
          ))}
        </div>
      </div>

      {children}
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
