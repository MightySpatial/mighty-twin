/** BasemapStrip — bottom-of-pane carousel of basemap tiles.
 *
 *  Mirrors the SiteStrip pattern: AllTrails-style horizontal cards
 *  with a square Overview / pinned tile prepended (here: the current
 *  basemap acts as the visual anchor). Tap a tile to switch
 *  basemaps; the host owns the actual `switchBasemap(id)` call.
 *
 *  Each tile shows:
 *    - a 76×76 (80×80 desktop) preview thumbnail of the basemap
 *      (gradient placeholder until a real preview URL is supplied)
 *    - the basemap label ("Satellite", "Roads", "OpenStreetMap")
 *    - active state when its id matches `activeBasemapId`
 *
 *  Used in place of the legacy BasemapWidget popup. */

import { useEffect, useRef } from 'react'
import styles from './BasemapStrip.module.css'

export interface BasemapStripItem {
  id: string
  label: string
  /** Optional preview image. When omitted, the tile renders a
   *  gradient placeholder so the picker still works. */
  preview_url?: string | null
  /** Optional one-line description ("Bing aerial", "© OpenStreetMap"). */
  caption?: string | null
}

export interface BasemapStripProps {
  basemaps: BasemapStripItem[]
  activeBasemapId: string | null
  onSelectBasemap: (id: string) => void
  /** Optional header label (defaults to "Basemap"). */
  headerLabel?: string
}

/** Fallback gradients keyed by basemap id so each tile gets a
 *  consistent placeholder appearance across renders. */
const FALLBACK_GRADIENTS: Record<string, string> = {
  'bing-aerial': 'linear-gradient(135deg, #1e3a5f, #0a1929)',
  'bing-hybrid': 'linear-gradient(135deg, #2c4a6d, #1a2a3c)',
  'bing-road':   'linear-gradient(135deg, #3a4a5a, #1f2a35)',
  'osm':         'linear-gradient(135deg, #4a6e3a, #8aa55b)',
}

function fallbackFor(id: string): string {
  return FALLBACK_GRADIENTS[id] ?? 'linear-gradient(135deg, #3a3f55, #1d2030)'
}

export function BasemapStrip({
  basemaps,
  activeBasemapId,
  onSelectBasemap,
  headerLabel = 'Basemap',
}: BasemapStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Scroll the active tile into view when it changes.
  useEffect(() => {
    if (!activeBasemapId) return
    const el = tileRefs.current[activeBasemapId]
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    const r = el.getBoundingClientRect()
    const s = scroller.getBoundingClientRect()
    if (r.left < s.left || r.right > s.right) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [activeBasemapId])

  if (basemaps.length === 0) return null

  return (
    <div className={styles.basemapStrip}>
      <div className={styles.header}>
        <span>{headerLabel}</span>
      </div>
      <div className={styles.tiles} ref={scrollerRef}>
        {basemaps.map((bm) => {
          const active = bm.id === activeBasemapId
          const previewStyle: React.CSSProperties = bm.preview_url
            ? {
                backgroundImage: `url(${JSON.stringify(bm.preview_url)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: fallbackFor(bm.id) }
          return (
            <button
              key={bm.id}
              ref={(el) => {
                tileRefs.current[bm.id] = el
              }}
              type="button"
              className={`${styles.tile} ${active ? styles.tileActive : ''}`}
              onClick={() => onSelectBasemap(bm.id)}
              aria-pressed={active}
            >
              <span className={styles.preview} style={previewStyle} aria-hidden />
              <span className={styles.label}>{bm.label}</span>
              {bm.caption && <span className={styles.caption}>{bm.caption}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default BasemapStrip
