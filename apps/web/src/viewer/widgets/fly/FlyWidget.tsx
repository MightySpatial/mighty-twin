/** Fly widget — overlay UI for the fly-through camera.
 *
 *  The actual locomotion is implemented by ``useFlyMode`` in
 *  CesiumViewer/hooks. This widget is the user-facing chrome:
 *    - Sequential 5-gear shifter (Cycling → Driving → Gliding → Jet →
 *      Fighter Jet) with ‹ / › arrows and a click-to-select pill strip
 *    - Key hints for new users (WASD / arrows / + / -)
 *    - Brief on-change badge ("Jet") when the gear changes
 *    - Exit button (also bound to Esc)
 *
 *  Desktop: floating bottom-centre panel.
 *  Mobile : bottom MiniPlayer ribbon — same shifter, plus arrow pads in
 *           the expanded body for touch locomotion.
 */

import { useEffect, useRef, useState } from 'react'
import { Plane, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { MiniPlayer } from '../../components/MiniPlayer'
import type { FlySpeed } from '../../components/CesiumViewer/hooks/useFlyMode'
import {
  FLY_SPEEDS,
  flySpeedLabel,
  flySpeedMps,
  flySpeedIndex,
  shiftGear,
} from '../../components/CesiumViewer/hooks/useFlyMode'
import './FlyWidget.css'

export interface FlyWidgetProps {
  speed: FlySpeed
  setSpeed: (s: FlySpeed) => void
  onClose: () => void
  isMobile?: boolean
  /** Optional touch nudge — host wires to the underlying camera so the
   *  mobile arrow pads can move forward/back/strafe without keys. */
  onTouchMove?: (axis: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down', start: boolean) => void
}

const TOAST_MS = 1200

export default function FlyWidget({
  speed,
  setSpeed,
  onClose,
  isMobile = false,
  onTouchMove,
}: FlyWidgetProps) {
  const idx = flySpeedIndex(speed)

  // Toast badge — show on every gear change, auto-dismiss after
  // ``TOAST_MS``. We seed ``prevRef`` from the initial value so the
  // first mount doesn't flash a badge for the default gear.
  const prevRef = useRef<FlySpeed>(speed)
  const [toast, setToast] = useState<FlySpeed | null>(null)
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
          return (
            <button
              key={g.id}
              type="button"
              className={`fly-shifter-pill${active ? ' fly-shifter-pill--active' : ''}`}
              onClick={() => setSpeed(g.id)}
              title={`${g.label} · ${g.mps.toFixed(1)} m/s`}
              aria-pressed={active}
            >
              <span className="fly-shifter-pill-label">{g.label}</span>
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

  // Desktop floating panel
  return (
    <>
      <div className="fly-panel" role="dialog" aria-label="Fly mode">
        <div className="fly-panel-header">
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
