/**
 * DraggableMai — collapsible, draggable AI affordance.
 *
 * Default state on every form factor: a small pink "Mai" FAB anchored
 * bottom-right above the secondary rail. Clicking the FAB opens the
 * chat panel (floating window on desktop, bottom sheet on phone).
 * Dragging the FAB repositions it. Position survives tab navigation
 * (sessionStorage). The chat panel anchors near the FAB on desktop so
 * opening doesn't yank the user's attention to a new corner.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import ChatPanel from './ChatPanel'

const FAB_KEY = 'mighty:mai:fab'

function loadFabPos(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(FAB_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveFabPos(p: { x: number; y: number }) {
  try { sessionStorage.setItem(FAB_KEY, JSON.stringify(p)) } catch {}
}

/** Default FAB anchor: bottom-right of the viewport. On phone the shell
 *  stacks two 64 px chromes at the bottom — the per-pane bottom-nav
 *  (Atlas section nav, Settings section nav) and the outer Map/Atlas/
 *  Settings tab bar. Clearance has to cover BOTH (64 + 64 = 128) plus
 *  ~14 px breathing room so the FAB sits cleanly above the carousel
 *  rather than over its top edge. Viewer's compact widget rail uses
 *  the same height, so this value works on every pane. */
function defaultFabPos() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  return {
    x: window.innerWidth - FAB_SIZE - 24,
    y: window.innerHeight - FAB_SIZE - 142,
  }
}

const FAB_SIZE = 52
const PANEL_W = 360
const PANEL_H = 540
/** Width that MAI shifts left by when the right pane is docked
 *  open. Matches CesiumViewer's rightPaneWidth (320 px). */
const RP_SHIFT = 320

/** Top-level entry point. Desktop and phone share the FAB pattern;
 *  the only difference is how the expanded chat surfaces (anchored
 *  floating panel on desktop, bottom sheet on phone).
 *
 *  In `?forceBreakpoint=` dev-preview mode the shell wraps the app in a
 *  device-frame mockup, but DraggableMai is mounted as a sibling of
 *  AppShell at App.tsx root — so its position:fixed FAB lands in the
 *  outer viewport corner, far outside the frame. Hide the FAB whenever
 *  a forced breakpoint is active so the preview is navigable; Mai is
 *  still available in real use (and on actual phones). */
function isForcedPreview(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('forceBreakpoint')
}

export function DraggableMai() {
  const [isPhone, setIsPhone] = useState(() => window.innerWidth < 768)
  const [previewActive, setPreviewActive] = useState(() => isForcedPreview())

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    // The shell toggles `forceBreakpoint` via history.replaceState, which
    // doesn't fire popstate. Re-check on every render path that could
    // have changed it: popstate (back/forward), pageshow, and a short
    // polling fallback for in-place URL rewrites.
    const update = () => setPreviewActive(isForcedPreview())
    window.addEventListener('popstate', update)
    window.addEventListener('pageshow', update)
    const id = window.setInterval(update, 500)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('pageshow', update)
      window.clearInterval(id)
    }
  }, [])

  if (previewActive) return null
  return isPhone ? <MaiFab variant="phone" /> : <MaiFab variant="desktop" />
}

/* ──────────────────────────────────────────────────────────────────────────
   MaiFab — pink draggable FAB + expandable surface.
   On desktop the surface is an anchored floating chat panel.
   On phone the surface is a bottom sheet (modal-like).
─────────────────────────────────────────────────────────────────────────── */


function MaiFab({ variant }: { variant: 'desktop' | 'phone' }) {
  const [fabPos, setFabPos] = useState(() => loadFabPos() ?? defaultFabPos())
  // Right-pane open / closed — flipped by a window event the
  // viewer host dispatches when activeRightWidget changes. Used to
  // shift MAI left by 320px so the FAB doesn't end up under the
  // docked pane.
  const [rpOpen, setRpOpen] = useState(false)
  useEffect(() => {
    const onOpen = () => setRpOpen(true)
    const onClose = () => setRpOpen(false)
    window.addEventListener('mighty:rp-open', onOpen)
    window.addEventListener('mighty:rp-close', onClose)
    return () => {
      window.removeEventListener('mighty:rp-open', onOpen)
      window.removeEventListener('mighty:rp-close', onClose)
    }
  }, [])
  // Effective fab x — saved pos shifted by RP_SHIFT when the pane
  // is open. Clamped so an extreme shift doesn't push MAI off the
  // left edge.
  const fabRenderX = rpOpen ? Math.max(8, fabPos.x - RP_SHIFT) : fabPos.x
  const [expanded, setExpanded] = useState(false)
  // Drag bookkeeping. We use one pointer event handler that runs on
  // both mouse and touch so the FAB feels identical on every device.
  // `moved` discriminates a click (open/close) from a drag (reposition).
  const drag = useRef({
    px: 0, py: 0,        // pointerdown viewport coords
    fx: 0, fy: 0,        // fab position when drag started
    pointerId: -1,
    moved: false,
  })
  // Phone tools sheet is up — hide the FAB so it doesn't cover the
  // rightmost widget tile in the carousel. MapShell dispatches the
  // open/close events when the mobile sheet toggles.
  const [toolsOpen, setToolsOpen] = useState(false)
  useEffect(() => {
    const onOpen = () => setToolsOpen(true)
    const onClose = () => setToolsOpen(false)
    window.addEventListener('mighty:tools-open', onOpen)
    window.addEventListener('mighty:tools-close', onClose)
    return () => {
      window.removeEventListener('mighty:tools-open', onOpen)
      window.removeEventListener('mighty:tools-close', onClose)
    }
  }, [])

  const clampFab = useCallback((p: { x: number; y: number }) => ({
    x: Math.max(8, Math.min(window.innerWidth - FAB_SIZE - 8, p.x)),
    y: Math.max(8, Math.min(window.innerHeight - FAB_SIZE - 8, p.y)),
  }), [])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Capture so we get pointermove/up even if the pointer leaves the
    // FAB while dragging.
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      fx: fabPos.x,
      fy: fabPos.y,
      pointerId: e.pointerId,
      moved: false,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    if (!drag.current.moved && Math.hypot(dx, dy) < 6) return
    drag.current.moved = true
    const next = clampFab({ x: drag.current.fx + dx, y: drag.current.fy + dy })
    setFabPos(next)
    saveFabPos(next)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* released */ }
    drag.current.pointerId = -1
  }
  // Toggle on click. The drag.moved guard skips the synthetic click
  // browsers fire after a mouse drag, so dragging to reposition
  // doesn't accidentally also open/close the panel. Keyboard Enter/
  // Space activation flows through here naturally (no pointer events
  // fired → drag.moved stays false → toggle).
  const onClick = () => {
    if (drag.current.moved) {
      drag.current.moved = false
      return
    }
    setExpanded(prev => !prev)
  }

  // Re-clamp when the window resizes so the FAB never ends up off-screen.
  useEffect(() => {
    const onResize = () => setFabPos(prev => clampFab(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampFab])

  // Where the desktop panel sits relative to the FAB. The panel hangs
  // up-and-left from the FAB so it stays on-screen no matter where
  // the user parked the FAB; if that would push it off the top/left
  // edge, we flip to align with the FAB's other corner.
  const panelPos = (() => {
    if (variant !== 'desktop') return { left: 0, top: 0 }
    const margin = 12
    let left = fabPos.x + FAB_SIZE - PANEL_W
    let top = fabPos.y - PANEL_H - margin
    if (left < margin) left = fabPos.x  // FAB near left edge → align panel left to FAB left
    if (top < margin) top = fabPos.y + FAB_SIZE + margin  // not enough room above → drop below
    // Final clamps so the panel itself never goes off-screen.
    left = Math.max(margin, Math.min(window.innerWidth - PANEL_W - margin, left))
    top = Math.max(margin, Math.min(window.innerHeight - PANEL_H - margin, top))
    return { left, top }
  })()

  return createPortal(
    <>
      {/* FAB — pink Mai badge. Always visible; click to expand, drag
          to reposition. */}
      <button
        type="button"
        aria-label="Open Mighty AI"
        aria-expanded={expanded}
        data-rp-open={rpOpen ? '1' : '0'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        style={{
          position: 'fixed',
          left: fabRenderX,
          top: fabPos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #ec4899, #d946ef)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          boxShadow: expanded
            ? '0 8px 28px rgba(236, 72, 153, 0.55), 0 0 0 3px rgba(236, 72, 153, 0.18)'
            : '0 6px 20px rgba(236, 72, 153, 0.45)',
          zIndex: 8000,
          touchAction: 'none',
          transition: 'box-shadow 180ms ease, transform 180ms ease, left 200ms ease, opacity 160ms ease',
          transform: expanded ? 'scale(0.94)' : 'scale(1)',
          userSelect: 'none',
          opacity: variant === 'phone' && toolsOpen ? 0 : 1,
          pointerEvents: variant === 'phone' && toolsOpen ? 'none' : 'auto',
        }}
      >
        <Sparkles size={22} strokeWidth={2.25} />
      </button>

      {/* Desktop: anchored floating chat panel near the FAB. */}
      {expanded && variant === 'desktop' && (
        <div
          role="dialog"
          aria-label="Mai chat"
          style={{
            position: 'fixed',
            left: panelPos.left,
            top: panelPos.top,
            width: PANEL_W,
            height: PANEL_H,
            zIndex: 8000,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow:
              '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(236, 72, 153, 0.22)',
            background: 'rgba(15,15,20,0.97)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(217, 70, 239, 0.06))',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#f0f2f8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={12} color="#ec4899" />
              Mai
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close Mai"
              style={{
                width: 22,
                height: 22,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.10)',
                borderRadius: 5,
                color: 'rgba(240, 242, 248, 0.7)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ChatPanel />
          </div>
        </div>
      )}

      {/* Phone: bottom sheet behind a backdrop. */}
      {expanded && variant === 'phone' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 8100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{
              width: '100%',
              height: '70vh',
              background: 'rgba(15,15,20,0.98)',
              backdropFilter: 'blur(16px)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderTop: '1px solid rgba(236, 72, 153, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 36,
                height: 4,
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 2,
                margin: '8px auto 4px',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ChatPanel />
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
