/** Horizontal scroll carousel — one row, hidden scrollbar, fade-mask
 *  on edges with overflow, and (optional) clickable chevron arrows
 *  that appear only when there's content to scroll to in that
 *  direction. Used by:
 *    • Desktop SecondaryRail — arrows on (the "fade under arrows" feel).
 *    • Mobile tools-sheet Widgets — arrows off, pure touch scroll.
 *
 *  Why not the previous bespoke implementations: the desktop rail
 *  had a fade-right mask with no way to actually reach the hidden
 *  tiles on a non-touch device, and the mobile sheet's grid wrapped
 *  to a second row whenever we had 5+ widgets. This unifies both
 *  into one row + horizontal scroll + a real affordance to scroll.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './Carousel.module.css'

interface CarouselProps {
  children: ReactNode
  /** Show chevron buttons when there's overflow in that direction.
   *  Desktop callers leave this on; touch callers turn it off and
   *  rely on flick/scroll. */
  showArrows?: boolean
  /** Snap each tile to the start on scroll-end. Touch callers
   *  usually want this for that "settle on a tile" feel; desktop
   *  with arrows usually doesn't. */
  snap?: boolean
  className?: string
}

export function Carousel({
  children,
  showArrows = true,
  snap = false,
  className = '',
}: CarouselProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  // Re-measure when content changes OR when the container resizes
  // (widget catalog edit, viewport rotate, sidebar open/close).
  // useLayoutEffect runs before paint so the initial render already
  // has the correct fade-mask + arrow state.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el
      // 2px tolerance — sub-pixel rounding can otherwise flicker the
      // right arrow at the exact scroll-end position.
      setCanLeft(scrollLeft > 2)
      setCanRight(scrollLeft + clientWidth < scrollWidth - 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [children])

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(140, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const fadeClass = `${canLeft ? styles.fadeLeft : ''} ${canRight ? styles.fadeRight : ''}`.trim()
  const snapClass = snap ? styles.snap : ''

  return (
    <div className={`${styles.carousel} ${className}`}>
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${fadeClass} ${snapClass}`}
      >
        {children}
      </div>
      {showArrows && canLeft && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {showArrows && canRight && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={() => scroll(1)}
          aria-label="Scroll right"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
