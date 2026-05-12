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
import styles from './SiteStrip.module.css'

export interface SiteStripItem {
  slug: string
  name: string
  description?: string | null
  is_public_pre_login?: boolean | null
  layer_count?: number | null
  primary_color?: string | null
}

export interface SiteStripProps {
  sites: SiteStripItem[]
  activeSiteSlug: string | null
  onSelectSite: (slug: string) => void
  /** Optional override label for the header row (defaults to "Sites"). */
  headerLabel?: string
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
      card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeSiteSlug])

  if (sites.length === 0) return null

  return (
    <div className={styles.siteStrip}>
      <div className={styles.header}>
        <span>{headerLabel}</span>
        <span className={styles.count}>{sites.length}</span>
      </div>
      <div className={styles.cards} ref={scrollerRef}>
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
              <span className={styles.thumb} style={{ background: gradient }} />
              <span className={styles.info}>
                <span className={styles.name}>{site.name}</span>
                <span className={styles.meta}>
                  {typeof site.layer_count === 'number' && site.layer_count > 0 && (
                    <>
                      <span>{site.layer_count} layer{site.layer_count === 1 ? '' : 's'}</span>
                    </>
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
