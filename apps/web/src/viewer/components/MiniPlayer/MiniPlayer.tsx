/** Mini-player ribbon — mobile widget chrome.
 *
 *  Two layouts share one component:
 *
 *    placement="top"     — petite floating ribbon near the top of the
 *                          map, like a podcast app's now-playing chip.
 *                          Width hugs the content; rounded pill.
 *    placement="bottom"  — full-width bar pinned to the bottom of the
 *                          map (above the bottom-nav rails). Best when
 *                          the widget needs more room (lists, sliders).
 *
 *  Either layout leaves the map visible above/around it so the user
 *  can keep their orientation while picking inside the widget. On
 *  desktop the widget should NOT use this — it has plenty of room
 *  for a floating panel.
 *
 *  The ribbon is "expandable": tap the chevron (or the title) to grow
 *  it up to a height the host caller controls (defaults to 240px).
 *  Swipe the grab handle down to collapse → close.
 */

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import './MiniPlayer.css'

export type MiniPlayerPlacement = 'top' | 'bottom'

export interface MiniPlayerProps {
  /** Where the ribbon docks — top floating pill or bottom full-width bar. */
  placement?: MiniPlayerPlacement
  /** Lucide-style icon shown left of the title. */
  icon?: React.ReactNode
  /** Title — short widget name. */
  title: string
  /** Optional secondary line — current value, count, or pick state. */
  subtitle?: string
  /** Compact summary content — always visible (collapsed state).
   *  Use for chips, current selection, quick toggles. */
  compact?: React.ReactNode
  /** Expanded body — only rendered when the ribbon is open. Pickers
   *  / lists / sliders go here. */
  expanded?: React.ReactNode
  /** When the host wants to gate "expand" behind explicit user
   *  consent (e.g. heavy content), set false to keep the ribbon
   *  permanently collapsed. Defaults true. */
  expandable?: boolean
  /** Initial open state (only meaningful when expandable). */
  defaultOpen?: boolean
  /** Maximum height of the expanded body. Falls back to 240. */
  maxExpandedHeight?: number
  /** Close button → calls back. When omitted, no close button. */
  onClose?: () => void
}

export default function MiniPlayer({
  placement = 'bottom',
  icon,
  title,
  subtitle,
  compact,
  expanded,
  expandable = true,
  defaultOpen = false,
  maxExpandedHeight = 240,
  onClose,
}: MiniPlayerProps) {
  const [open, setOpen] = useState(defaultOpen)

  // Swipe-to-dismiss on the grab handle. Same gesture pattern as the
  // mobile site picker: 80px travel or 0.5px/ms velocity → close.
  const drag = useRef<{ y0: number; t0: number; lastY: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  function onPtrDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y0: e.clientY, t0: Date.now(), lastY: e.clientY }
    setIsDragging(true)
  }
  function onPtrMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const dy = placement === 'bottom'
      ? Math.max(0, e.clientY - drag.current.y0)
      : Math.min(0, e.clientY - drag.current.y0)
    drag.current.lastY = e.clientY
    setDragOffset(dy)
  }
  function onPtrEnd() {
    if (!drag.current) return
    const totalDy = drag.current.lastY - drag.current.y0
    const elapsed = Math.max(1, Date.now() - drag.current.t0)
    const velocity = Math.abs(totalDy) / elapsed
    drag.current = null
    setIsDragging(false)
    const triggers =
      Math.abs(totalDy) > 80 ||
      velocity > 0.5
    const swipingAway =
      placement === 'bottom' ? totalDy > 0 : totalDy < 0
    if (triggers && swipingAway) {
      onClose?.()
    } else {
      setDragOffset(0)
    }
  }

  return (
    <div
      className={`mp-ribbon mp-ribbon--${placement}${
        open ? ' mp-ribbon--open' : ''
      }`}
      style={{
        transform: `translateY(${dragOffset}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 200ms cubic-bezier(0.32,0.72,0,1), max-height 200ms ease',
        maxHeight: open ? maxExpandedHeight + 64 : 64,
      }}
    >
      {/* Header — always visible */}
      <div
        className="mp-ribbon-header"
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrEnd}
        onPointerCancel={onPtrEnd}
      >
        {placement === 'bottom' && (
          <div className="mp-ribbon-handle">
            <div className="mp-ribbon-handle-bar" />
          </div>
        )}
        <div className="mp-ribbon-row">
          {icon && <span className="mp-ribbon-icon">{icon}</span>}
          <button
            type="button"
            className="mp-ribbon-titles"
            onClick={() => expandable && setOpen((o) => !o)}
          >
            <span className="mp-ribbon-title">{title}</span>
            {subtitle && <span className="mp-ribbon-subtitle">{subtitle}</span>}
          </button>
          {compact && <div className="mp-ribbon-compact">{compact}</div>}
          {expandable && (
            <button
              type="button"
              className="mp-ribbon-icon-btn"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Collapse' : 'Expand'}
              title={open ? 'Collapse' : 'Expand'}
            >
              {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="mp-ribbon-icon-btn"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {open && expanded && (
        <div
          className="mp-ribbon-body"
          style={{ maxHeight: maxExpandedHeight }}
        >
          {expanded}
        </div>
      )}
    </div>
  )
}
