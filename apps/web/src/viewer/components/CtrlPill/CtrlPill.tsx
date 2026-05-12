/** CtrlPill — shared primary controller pill for the Map pane.
 *
 *  Top-left floating pill carrying the site chip + camera controls
 *  (zoom in/out, home, fit-bounds, basemap toggle). Renders the same
 *  way on phone, tablet portrait, tablet landscape, and desktop —
 *  positioning is identical across breakpoints because the brief
 *  treats this as bottom-anchored chrome's top-of-pane counterpart.
 *
 *  Two states:
 *    - currentSite === null → "All sites · N" with a stack-of-maps avatar
 *    - currentSite set     → site avatar (single letter) + site name
 *
 *  The Overview back-affordance is intentionally NOT in this component.
 *  It lives at the start of the widget rail as a square violet tile
 *  (see §3.5 of the implementation brief). */

import {
  ZoomIn,
  ZoomOut,
  Home as HomeIcon,
  Maximize,
  Map as MapIcon,
  Square,
  Globe,
} from 'lucide-react'
import styles from './CtrlPill.module.css'

export interface CtrlPillSite {
  slug: string
  name: string
}

export interface CtrlPillProps {
  /** Currently displayed site. null = all-sites overview state. */
  currentSite: CtrlPillSite | null
  /** Site count for the "All sites · N" label (overview state only). */
  siteCount?: number
  /** Camera control handlers — owned by the host component. */
  onZoomIn: () => void
  onZoomOut: () => void
  onHome: () => void
  /** Frame-to-bounds. Optional — when omitted the button is hidden. */
  onFitBounds?: () => void
  /** Basemap picker toggle. Optional — when omitted the button is hidden. */
  onBasemapClick?: () => void
  /** 2D/3D toggle. Optional — when omitted the button is hidden. */
  onToggle2D3D?: () => void
  /** True when the viewer is in 2D mode (toggle icon flips). */
  is2D?: boolean
  /** Click on the site chip itself — opens the site picker. */
  onSiteChipClick?: () => void
}

export function CtrlPill({
  currentSite,
  siteCount,
  onZoomIn,
  onZoomOut,
  onHome,
  onFitBounds,
  onBasemapClick,
  onToggle2D3D,
  is2D = false,
  onSiteChipClick,
}: CtrlPillProps) {
  return (
    <div className={styles.ctrlPill}>
      {currentSite ? (
        <button
          type="button"
          className={styles.ctrlSite}
          onClick={onSiteChipClick}
          title={`Switch site — ${currentSite.name}`}
        >
          <span className={styles.avatar}>
            {currentSite.name.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.siteName}>{currentSite.name}</span>
        </button>
      ) : (
        <div className={styles.ctrlSite}>
          <span className={`${styles.avatar} ${styles.avatarAllSites}`}>
            <AllSitesGlyph />
          </span>
          <span className={styles.siteName}>
            All sites
            {typeof siteCount === 'number' && (
              <span className={styles.siteCount}> · {siteCount}</span>
            )}
          </span>
        </div>
      )}
      <button
        type="button"
        className={styles.ctrlBtn}
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={16} />
      </button>
      <button
        type="button"
        className={styles.ctrlBtn}
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={16} />
      </button>
      <div className={styles.ctrlDivider} aria-hidden />
      <button
        type="button"
        className={styles.ctrlBtn}
        onClick={onHome}
        title="Home"
        aria-label="Home view"
      >
        <HomeIcon size={16} />
      </button>
      {onFitBounds && (
        <button
          type="button"
          className={styles.ctrlBtn}
          onClick={onFitBounds}
          title="Fit to bounds"
          aria-label="Fit to bounds"
        >
          <Maximize size={16} />
        </button>
      )}
      {onToggle2D3D && (
        <button
          type="button"
          className={styles.ctrlBtn}
          onClick={onToggle2D3D}
          title={is2D ? 'Switch to 3D' : 'Switch to 2D'}
          aria-label={is2D ? 'Switch to 3D' : 'Switch to 2D'}
        >
          {is2D ? <Globe size={16} /> : <Square size={16} />}
        </button>
      )}
      {onBasemapClick && (
        <button
          type="button"
          className={styles.ctrlBtn}
          onClick={onBasemapClick}
          title="Basemap"
          aria-label="Basemap picker"
        >
          <MapIcon size={16} />
        </button>
      )}
    </div>
  )
}

function AllSitesGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

export default CtrlPill
