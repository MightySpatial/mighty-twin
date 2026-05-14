/** SiteStrip — bottom-of-pane horizontal site picker for the
 *  all-sites overview state. Replaces the widget rail one-for-one:
 *  the widget rail is per-site, so when no site is loaded the bottom
 *  slot shows this strip instead.
 *
 *  Bidirectional sync with map pins:
 *    - Clicking a card calls `onSelectSite(slug)` (host navigates).
 *    - When `activeSiteSlug` changes (e.g. user picks a pin), the
 *      strip scrolls the matching card into view.
 *
 *  Width: full-width on phone; max-width 960px centered on desktop —
 *  the host pane positions the strip; this component just sets the
 *  inner card row layout. See §3.7 of mockups/IMPLEMENTATION.md. */

import { useEffect, useRef } from 'react'
import { Globe } from 'lucide-react'
import styles from './SiteStrip.module.css'

export interface SiteStripItem {
  slug: string
  name: string
  description?: string | null
  is_public_pre_login?: boolean | null
  layer_count?: number | null
  primary_color?: string | null
  /** Optional photo URL for the card thumbnail. When set, the photo
   *  fills the thumb in cover mode (AllTrails-style). When omitted,
   *  the thumb falls back to a gradient + the site's initials. */
  thumbnail_url?: string | null
}

export interface SiteStripProps {
  sites: SiteStripItem[]
  activeSiteSlug: string | null
  onSelectSite: (slug: string) => void
  /** Optional override label for the header row (defaults to "Sites"). */
  headerLabel?: string
  /** When provided, an "All sites" tile is rendered as the FIRST card.
   *  Tapping it calls this handler (typically to navigate back to the
   *  all-sites overview route). The brief moves the Overview affordance
   *  into the site carousel itself when it's open. */
  onNavigateOverview?: () => void
  /** Optional hero image URL for the Overview tile. When set, the
   *  image fills the tile in cover mode; the Globe icon stays on top
   *  as a recognisability cue. When omitted, the tile keeps the
   *  violet gradient. Lets Atlas admins brand the "all sites"
   *  destination with a workspace photo. */
  overviewImageUrl?: string | null
}

/** Take 1–2 character initials from a site name for the avatar fallback.
 *  "Demo site" → "DS", "Mountain Ridge" → "MR", "MyCorp" → "M". */
function siteInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return '?'
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase()
  return (tokens[0].charAt(0) + tokens[1].charAt(0)).toUpperCase()
}

const GRADIENTS = [
  'linear-gradient(135deg, #2c4a6d, #2c5e4a)',
  'linear-gradient(135deg, #5c3424, #2c4a6d)',
  'linear-gradient(135deg, #3a2a52, #2c5e4a)',
  'linear-gradient(135deg, #1d2a3c, #4a5c2c)',
]

function hashSlug(slug: string): number {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function SiteStrip({
  sites,
  activeSiteSlug,
  onSelectSite,
  headerLabel = 'Sites',
  onNavigateOverview,
  overviewImageUrl,
}: SiteStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (!activeSiteSlug) return
    const card = cardRefs.current[activeSiteSlug]
    const scroller = scrollerRef.current
    if (!card || !scroller) return
    const cardRect = card.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    if (cardRect.left < scrollerRect.left || cardRect.right > scrollerRect.right) {
      // `inline: 'nearest'` instead of 'center' so the Overview tile
      // (always the first card) stays visible on the left edge of the
      // strip after auto-scroll. With 'center' the active site card
      // got centered horizontally, which pushed the Overview tile off
      // the left edge — losing the "back to all sites" affordance.
      card.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    }
  }, [activeSiteSlug])

  if (sites.length === 0 && !onNavigateOverview) return null

  return (
    <div className={styles.siteStrip}>
      <div className={styles.header}>
        <span>{headerLabel}</span>
        {sites.length > 0 && <span className={styles.count}>{sites.length}</span>}
      </div>
      <div className={styles.cards} ref={scrollerRef}>
        {onNavigateOverview && (
          <button
            key="__overview"
            type="button"
            className={`${styles.card} ${styles.cardOverview}`}
            onClick={onNavigateOverview}
            aria-label="Back to all sites"
            title="Back to all sites"
            style={
              overviewImageUrl
                ? {
                    backgroundImage: `linear-gradient(135deg, rgba(99,102,241,0.55), rgba(167,139,250,0.55)), url(${JSON.stringify(overviewImageUrl)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <Globe size={26} />
          </button>
        )}
        {sites.map((site) => {
          const active = site.slug === activeSiteSlug
          const gradient =
            site.primary_color
              ? `linear-gradient(135deg, ${site.primary_color}, #1d2a3c)`
              : GRADIENTS[hashSlug(site.slug) % GRADIENTS.length]
          return (
            <button
              key={site.slug}
              ref={(el) => {
                cardRefs.current[site.slug] = el
              }}
              type="button"
              className={`${styles.card} ${active ? styles.cardActive : ''}`}
              onClick={() => onSelectSite(site.slug)}
            >
              <span
                className={styles.thumb}
                style={
                  site.thumbnail_url
                    ? {
                        backgroundImage: `url(${JSON.stringify(site.thumbnail_url)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : { background: gradient }
                }
                aria-hidden
              >
                {!site.thumbnail_url && (
                  <span className={styles.thumbInitials}>{siteInitials(site.name)}</span>
                )}
              </span>
              <span className={styles.info}>
                <span className={styles.name}>{site.name}</span>
                {site.description && (
                  <span className={styles.summary} title={site.description}>
                    {site.description}
                  </span>
                )}
                <span className={styles.meta}>
                  {typeof site.layer_count === 'number' && site.layer_count > 0 && (
                    <span>{site.layer_count} layer{site.layer_count === 1 ? '' : 's'}</span>
                  )}
                  {site.is_public_pre_login && (
                    <>
                      {typeof site.layer_count === 'number' && site.layer_count > 0 && (
                        <span className={styles.dot} />
                      )}
                      <span className={styles.badge}>Public</span>
                    </>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SiteStrip
