/** CtrlPill — primary controller chrome at the top of the Map pane.
 *
 *  Two visual variants:
 *    - `variant="pill"` — floating rounded pill (phone / tablet)
 *    - `variant="bar"`  — full-width solid bar across the top (desktop)
 *
 *  Items (in order, per spec):
 *    [Logo? (optional image)] [Name? (optional text)] [Sites click target]
 *    [+] [−] [Globe/Map toggle] [Basemap]
 *
 *  No home button — dropped from the top group on direct UX feedback;
 *  use the site picker's Overview card to reset to all-sites.
 *
 *  Dev mode: when `devContent` is provided, a second row renders
 *  underneath the primary controls. Used by the host to surface
 *  camera coordinates / FPS / viewer commands while developing.
 *
 *  Two site states:
 *    - currentSite === null  → "All sites · N" with a stack-of-maps glyph
 *    - currentSite set       → logo (if provided) OR initials avatar + name
 */

import { useMemo, type ReactNode } from 'react'
import {
  ZoomIn,
  ZoomOut,
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
  /** Optional workspace / site logo image. When set, replaces the
   *  initials avatar. When null/empty the avatar falls back to
   *  initials over a gradient (Demo Site → "DS"). */
  logoUrl?: string | null
  /** When false, hide the site name (logo-only chip). Default true. */
  showName?: boolean
  /** Workspace brand name shown as the leading wordmark in the pill.
   *  Wordmark is hidden on phone (only the brand mark/logo shows) so
   *  the row stays usable at 95vw. */
  brandName?: string
  /** Optional workspace brand logo image. When unset a small accent
   *  square is rendered as the brand mark. */
  brandLogoUrl?: string | null
  /** Camera control handlers — owned by the host component. */
  onZoomIn: () => void
  onZoomOut: () => void
  /** Basemap picker toggle. Optional — when omitted the button is hidden. */
  onBasemapClick?: () => void
  /** 2D/3D toggle. Optional — when omitted the button is hidden. */
  onToggle2D3D?: () => void
  /** True when the viewer is in 2D mode (toggle icon flips). */
  is2D?: boolean
  /** Click on the site chip — opens the site picker. */
  onSiteChipClick?: () => void
  /** "pill" = floating rounded chip (phone, tablet).
   *  "bar"  = full-width solid bar (desktop). */
  variant?: 'pill' | 'bar'
  /** Optional second row content shown when dev mode is enabled.
   *  Renders BELOW the primary controls in the same pill / bar. */
  devContent?: ReactNode
}

/** Initials from a site name: "Demo site" → "DS", "Mighty" → "M". */
function siteInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase()
  return (tokens[0].charAt(0) + tokens[1].charAt(0)).toUpperCase()
}

export function CtrlPill({
  currentSite,
  siteCount,
  logoUrl,
  showName = true,
  brandName,
  brandLogoUrl,
  onZoomIn,
  onZoomOut,
  onBasemapClick,
  onToggle2D3D,
  is2D = false,
  onSiteChipClick,
  variant = 'pill',
  devContent,
}: CtrlPillProps) {
  const avatarStyle = useMemo<React.CSSProperties | undefined>(
    () =>
      logoUrl
        ? {
            backgroundImage: `url(${JSON.stringify(logoUrl)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : undefined,
    [logoUrl],
  )

  const chipContent = (
    <>
      {currentSite ? (
        <>
          <span className={styles.avatar} style={avatarStyle}>
            {!logoUrl && siteInitials(currentSite.name)}
          </span>
          {showName && <span className={styles.siteName}>{currentSite.name}</span>}
        </>
      ) : (
        <>
          <span className={`${styles.avatar} ${styles.avatarAllSites}`} style={avatarStyle}>
            {!logoUrl && <AllSitesGlyph />}
          </span>
          {showName && (
            <span className={styles.siteName}>
              All sites
              {typeof siteCount === 'number' && (
                <span className={styles.siteCount}> · {siteCount}</span>
              )}
            </span>
          )}
        </>
      )}
    </>
  )

  // Overview state: no specific site is loaded but the workspace brand
  // IS available. Let the brand take the full top bar — the redundant
  // "All sites · N" chip is replaced by a count badge on the brand
  // block. On per-site view the brand stays compact and the site chip
  // takes over as the primary identity.
  const isOverview = !currentSite && !!brandName

  const brandBlock = brandName ? (
    <div
      className={`${styles.brand} ${isOverview ? styles.brandOverview : ''}`}
      aria-label={`Workspace: ${brandName}`}
    >
      {brandLogoUrl ? (
        <img className={styles.brandLogo} src={brandLogoUrl} alt="" />
      ) : (
        <span className={styles.brandMark} aria-hidden />
      )}
      <span className={styles.brandName}>{brandName}</span>
      {isOverview && typeof siteCount === 'number' && (
        <span className={styles.brandCount} aria-label={`${siteCount} sites`}>
          {siteCount}
        </span>
      )}
    </div>
  ) : null

  return (
    <div className={`${styles.ctrlPill} ${variant === 'bar' ? styles.variantBar : styles.variantPill}`}>
      <div className={styles.row}>
        {brandBlock}
        {/* Site chip is suppressed in overview state — the brand block
            already conveys workspace identity and the count badge
            replaces the "All sites · N" text. Per-site state still
            shows the chip beside the brand with a divider between. */}
        {!isOverview && brandBlock && <div className={styles.ctrlDivider} aria-hidden />}
        {!isOverview && (onSiteChipClick ? (
          <button
            type="button"
            className={styles.ctrlSite}
            onClick={onSiteChipClick}
            title={currentSite ? `Switch site — ${currentSite.name}` : 'Pick a site'}
            aria-label="Sites"
          >
            {chipContent}
          </button>
        ) : (
          <div className={styles.ctrlSite}>{chipContent}</div>
        ))}
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
        {onToggle2D3D && (
          <button
            type="button"
            className={styles.ctrlBtn}
            onClick={onToggle2D3D}
            title={is2D ? 'Switch to 3D globe' : 'Switch to 2D map'}
            aria-label={is2D ? 'Switch to 3D globe' : 'Switch to 2D map'}
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
      {devContent && (
        <div className={styles.devRow} role="group" aria-label="Developer controls">
          {devContent}
        </div>
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
