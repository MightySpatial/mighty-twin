/** Fly widget — overlay UI for the fly-through camera.
 *
 *  The actual locomotion is implemented by ``useFlyMode`` in
 *  CesiumViewer/hooks. This widget is the user-facing chrome:
 *    - Sequential 5-gear shifter (Cycling → Driving → Gliding → Jet →
 *      Fighter Jet) with ‹ / › arrows and a click-to-select pill strip
 *    - Key hints for new users (WASD / arrows / + / -)
 *    - Brief on-change badge ("Jet ✈️") when the gear changes
 *    - Exit button (also bound to Esc)
 *
 *  Desktop: floating bottom-centre panel.
 *  Mobile : bottom MiniPlayer ribbon — same shifter, plus arrow pads in
 *           the expanded body for touch locomotion.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plane, X, ChevronLeft, ChevronRight, ChevronDown,
  Footprints, Bike, Car, Wind, Zap,
  type LucideIcon,
} from 'lucide-react'
import { MiniPlayer } from '../../components/MiniPlayer'
import type { FlySpeed, FlySpeedId } from '../../components/CesiumViewer/hooks/useFlyMode'
import {
  FLY_SPEEDS,
  flySpeedLabel,
  flySpeedMps,
  flySpeedIndex,
  shiftGear,
} from '../../components/CesiumViewer/hooks/useFlyMode'
import './FlyWidget.css'

// Per-gear Lucide icon. Kept in the widget (not the hook) because it's
// a presentation concern — the hook only deals in speed values.
const GEAR_ICON: Record<FlySpeedId, LucideIcon> = {
  walk:       Footprints,
  cycling:    Bike,
  driving:    Car,
  gliding:    Wind,
  jet:        Plane,
  fighterJet: Zap,
}

export interface FlyWidgetProps {
  speed: FlySpeed
  setSpeed: (s: FlySpeed) => void
  onClose: () => void
  isMobile?: boolean
  /** Optional touch nudge — host wires to the underlying camera so the
   *  mobile arrow pads can move forward/back/strafe without keys. */
  onTouchMove?: (axis: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down', start: boolean) => void
  /** Render path:
   *    'floating' — original modal-style panel anchored bottom-centre
   *    'inline'   — compact bar for the RightPane's fixed bottom zone.
   *                 Shifter only; no key legend; no close button.
   *  Defaults to `'floating'`. */
  mode?: 'floating' | 'inline'
  /** Whether fly mode is currently active. Inline mode shows an "ON/OFF"
   *  pill in the header so users can tell if the gears are live; only
   *  consulted when `mode === 'inline'`. */
  active?: boolean
  /** Toggle fly active state from the inline pill. */
  onToggleActive?: () => void
}

const TOAST_MS = 1200

export default function FlyWidget({
  speed,
  setSpeed,
  onClose,
  isMobile = false,
  onTouchMove,
  mode = 'floating',
  active = true,
  onToggleActive,
}: FlyWidgetProps) {
  const inline = mode === 'inline'
  const idx = flySpeedIndex(speed)

  // Floating-mode drag + dock. Pointer events on the panel header
  // move the panel; if it ends up within DOCK_THRESHOLD of the
  // bottom edge of the viewport the panel snaps to a compact
  // bottom-centre bar (`docked` true). Dragging away from the
  // bottom un-docks back to the free-floating layout.
  const DOCK_THRESHOLD = 60
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null) // null = use CSS default
  const [docked, setDocked] = useState(false)
  const drag = useRef({ px: 0, py: 0, ox: 0, oy: 0, pointerId: -1, moved: false })

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Buttons inside the header (close, ACTIVE pill) get their own
    // clicks — don't initiate a drag from them.
    if ((e.target as HTMLElement).closest('button')) return
    const panel = (e.currentTarget.parentElement as HTMLElement)
    const rect = panel.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      ox: rect.left,
      oy: rect.top,
      pointerId: e.pointerId,
      moved: false,
    }
  }, [])
  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return
    drag.current.moved = true
    const nx = Math.max(0, Math.min(window.innerWidth - 120, drag.current.ox + dx))
    const ny = Math.max(0, Math.min(window.innerHeight - 40, drag.current.oy + dy))
    setPos({ x: nx, y: ny })
    // Live dock-state recompute while dragging — gives a clean
    // visual confirmation when the user crosses the threshold.
    setDocked((window.innerHeight - (ny + 40)) < DOCK_THRESHOLD)
  }, [])
  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* released */ }
    drag.current.pointerId = -1
  }, [])

  // Clear an inline pos when docked so the CSS bottom-centre rule
  // takes over (otherwise the inline left/top fights the centred
  // layout). Re-position on resize so the panel can't end up off-
  // screen when the viewport shrinks.
  useEffect(() => {
    if (!docked) return
    setPos(null)
  }, [docked])
  useEffect(() => {
    const onResize = () => setPos(p => {
      if (!p) return p
      return {
        x: Math.max(0, Math.min(window.innerWidth - 120, p.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, p.y)),
      }
    })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Toast badge — show on every gear change, auto-dismiss after
  // ``TOAST_MS``. We seed ``prevRef`` from the initial value so the
  // first mount doesn't flash a badge for the default gear.
  const prevRef = useRef<FlySpeed>(speed)
  const [toast, setToast] = useState<FlySpeed | null>(null)
  // Controls drawer (the WASD/arrow/Space/Esc legend). Hidden by
  // default — the floating popup opens compact to keep the
  // shifter the focus, and the user expands it on demand.
  const [showControls, setShowControls] = useState(false)
  useEffect(() => {
    if (prevRef.current === speed) return
    prevRef.current = speed
    setToast(speed)
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [speed])

  function gearAt(delta: 1 | -1) {
    const next = shiftGear(speed, delta)
    if (next !== speed) setSpeed(next)
  }

  const shifter = (
    <div className="fly-shifter" role="group" aria-label="Fly speed">
      <button
        type="button"
        className="fly-shifter-arrow"
        aria-label="Shift down one gear (−)"
        title="Shift down (−)"
        disabled={idx === 0}
        onClick={() => gearAt(-1)}
      >
        <ChevronLeft size={16} />
      </button>
      <div className="fly-shifter-pills">
        {FLY_SPEEDS.map((g, i) => {
          const active = i === idx
          const Icon = GEAR_ICON[g.id]
          return (
            <button
              key={g.id}
              type="button"
              className={`fly-shifter-pill${active ? ' fly-shifter-pill--active' : ''}`}
              onClick={() => setSpeed(g.id)}
              title={`${g.label} · ${g.mps.toFixed(1)} m/s`}
              aria-pressed={active}
            >
              <span className="fly-shifter-pill-icon" aria-hidden>
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="fly-shifter-pill-label">{g.label}</span>
              <span className="fly-shifter-pill-mps">{Math.round(g.mps)} m/s</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="fly-shifter-arrow"
        aria-label="Shift up one gear (+)"
        title="Shift up (+)"
        disabled={idx === FLY_SPEEDS.length - 1}
        onClick={() => gearAt(1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )

  const toastNode = toast ? (
    <div className="fly-toast" role="status" aria-live="polite">
      <span className="fly-toast-label">{flySpeedLabel(toast)}</span>
    </div>
  ) : null

  // ── Inline (right-pane body slot) ─────────────────────────────────
  // Fills the full right-pane height when Fly is the active widget —
  // shifter is large, key legend is two-column, and a tip card
  // bottoms out the layout. The user toggles locomotion via the
  // ACTIVE / OFF pill; closing the pane is the rail's job, not the
  // widget's. The toast still fires on gear changes so the shift
  // feedback is visible.
  if (inline) {
    return (
      <div className="fly-inline">
        <div className="fly-inline__hd">
          <span className="fly-inline__title">
            <Plane size={14} />
            Fly
          </span>
          <button
            type="button"
            className={`fly-inline__pill${active ? ' on' : ' off'}`}
            onClick={onToggleActive ?? onClose}
            aria-pressed={active}
          >
            {active ? 'ACTIVE' : 'OFF'}
          </button>
        </div>
        {shifter}
        <div className="fly-inline__keys">
          <KeyRow keys={['W', 'A', 'S', 'D']} label="Move" />
          <KeyRow keys={['↑', '↓']} label="Pitch" />
          <KeyRow keys={['←', '→']} label="Yaw" />
          <KeyRow keys={['Q', 'E']} label="Roll" />
          <KeyRow keys={['Space']} label="Climb" />
          <KeyRow keys={['+', '−']} label="Gear" />
          <KeyRow keys={['Shift']} label="2× sprint" />
          <KeyRow keys={['Esc']} label="Exit" />
        </div>
        <div className="fly-inline__tip">
          Click ACTIVE to engage locomotion. On mobile, single-finger
          drag the canvas to move, two-finger drag to look, pinch to
          shift gears.
        </div>
        {toastNode}
      </div>
    )
  }

  if (isMobile) {
    return (
      <>
        <MiniPlayer
          placement="bottom"
          icon={<Plane size={14} />}
          title="Fly mode"
          subtitle={`${flySpeedLabel(speed)} · ${flySpeedMps(speed).toFixed(1)} m/s`}
          defaultOpen
          maxExpandedHeight={340}
          onClose={onClose}
          compact={
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)' }}>
              Drag to look
            </div>
          }
          expanded={
            <div className="fly-mobile-body">
              {shifter}
              <div className="fly-touch-pad">
                <div /> {/* col1 row1 spacer */}
                <Pad axis="forward" onTouchMove={onTouchMove}>↑</Pad>
                <Pad axis="up" onTouchMove={onTouchMove}>+</Pad>
                <Pad axis="left" onTouchMove={onTouchMove}>←</Pad>
                <Pad axis="back" onTouchMove={onTouchMove}>↓</Pad>
                <Pad axis="right" onTouchMove={onTouchMove}>→</Pad>
                <div /> {/* col1 row3 spacer */}
                <Pad axis="down" onTouchMove={onTouchMove}>−</Pad>
                <div /> {/* col3 row3 spacer */}
              </div>
              <div className="fly-hint">
                Drag the map to look. Buttons move at {flySpeedLabel(speed)} pace.
              </div>
            </div>
          }
        />
        {toastNode}
      </>
    )
  }

  // Desktop floating panel — opens compact (gear shifter only). The
  // popup auto-activates fly mode on open via CesiumViewer wiring, so
  // there's no ACTIVE/OFF pill in the header — closing the popup
  // exits fly. The key legend is hidden behind a "Controls ▾" toggle
  // to keep the default footprint small.
  return (
    <>
      <div
        className={`fly-panel${docked ? ' is-docked' : ''}${showControls ? ' is-expanded' : ''}`}
        role="dialog"
        aria-label="Fly mode"
        style={pos && !docked ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      >
        <div
          className="fly-panel-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          style={{ cursor: 'grab', touchAction: 'none' }}
          title="Drag to reposition · drop near the bottom to dock"
        >
          <Plane size={14} />
          <span className="fly-panel-title">Fly mode</span>
          <button
            type="button"
            className="fly-panel-close"
            onClick={onClose}
            aria-label="Exit fly mode"
            title="Exit fly mode (Esc)"
          >
            <X size={14} />
          </button>
        </div>
        {shifter}
        <button
          type="button"
          className={`fly-controls-toggle${showControls ? ' is-open' : ''}`}
          onClick={() => setShowControls(s => !s)}
          aria-expanded={showControls}
          title={showControls ? 'Hide key controls' : 'Show key controls'}
        >
          <span>Controls</span>
          <ChevronDown size={12} className="fly-controls-toggle-chev" />
        </button>
        {showControls && (
          <div className="fly-keys">
            <KeyRow keys={['W', 'A', 'S', 'D']} label="Move" />
            <KeyRow keys={['↑', '↓']} label="Pitch" />
            <KeyRow keys={['←', '→']} label="Yaw" />
            <KeyRow keys={['Q', 'E']} label="Roll · auto-levels" />
            <KeyRow keys={['Space']} label="Climb" />
            <KeyRow keys={['+', '−']} label="Shift gear" />
            <KeyRow keys={['Shift']} label="2× sprint" />
            <KeyRow keys={['Drag']} label="Look around" />
            <KeyRow keys={['Esc']} label="Exit" />
          </div>
        )}
      </div>
      {toastNode}
    </>
  )
}

function Pad({
  axis,
  onTouchMove,
  children,
}: {
  axis: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down'
  onTouchMove?: FlyWidgetProps['onTouchMove']
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="fly-touch-btn"
      onPointerDown={(e) => {
        e.preventDefault()
        onTouchMove?.(axis, true)
      }}
      onPointerUp={() => onTouchMove?.(axis, false)}
      onPointerCancel={() => onTouchMove?.(axis, false)}
      onPointerLeave={() => onTouchMove?.(axis, false)}
    >
      {children}
    </button>
  )
}

function KeyRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="fly-keys-row">
      <div className="fly-keys-keys">
        {keys.map((k) => (
          <kbd key={k} className="fly-key">{k}</kbd>
        ))}
      </div>
      <span className="fly-keys-label">{label}</span>
    </div>
  )
}
