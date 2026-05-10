/** Walk widget — overlay UI for the walking/running fly-through camera.
 *
 *  The actual locomotion is implemented by ``useWalkMode`` in
 *  CesiumViewer/hooks. This widget is the user-facing chrome:
 *    - Speed picker (Walk · 1.4 m/s, Run · 3.5 m/s, Sprint · 7 m/s)
 *    - Key hints for new users
 *    - Exit button (also bound to Esc)
 *
 *  Desktop: floating bottom-centre panel.
 *  Mobile : bottom MiniPlayer ribbon — same speed picker, plus arrow
 *           pads in the expanded body for touch locomotion.
 */

import { Footprints, X } from 'lucide-react'
import { MiniPlayer } from '../../components/MiniPlayer'
import type { WalkSpeed } from '../../components/CesiumViewer/hooks/useWalkMode'
import { walkSpeedLabel, walkSpeedMps } from '../../components/CesiumViewer/hooks/useWalkMode'
import './WalkWidget.css'

export interface WalkWidgetProps {
  speed: WalkSpeed
  setSpeed: (s: WalkSpeed) => void
  onClose: () => void
  isMobile?: boolean
  /** Optional touch nudge — host wires to the underlying camera so the
   *  mobile arrow pads can move forward/back/strafe without keys. */
  onTouchMove?: (axis: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down', start: boolean) => void
}

const SPEEDS: WalkSpeed[] = ['walk', 'run', 'sprint']

export default function WalkWidget({
  speed,
  setSpeed,
  onClose,
  isMobile = false,
  onTouchMove,
}: WalkWidgetProps) {
  const speedRow = (
    <div className="walk-speed-row">
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          className={`walk-speed${s === speed ? ' walk-speed--active' : ''}`}
          onClick={() => setSpeed(s)}
          title={`${walkSpeedLabel(s)} · ${walkSpeedMps(s).toFixed(1)} m/s`}
        >
          <span className="walk-speed-label">{walkSpeedLabel(s)}</span>
          <span className="walk-speed-mps">{walkSpeedMps(s).toFixed(1)} m/s</span>
        </button>
      ))}
    </div>
  )

  if (isMobile) {
    return (
      <MiniPlayer
        placement="bottom"
        icon={<Footprints size={14} />}
        title="Walk mode"
        subtitle={`${walkSpeedLabel(speed)} · ${walkSpeedMps(speed).toFixed(1)} m/s`}
        defaultOpen
        maxExpandedHeight={300}
        onClose={onClose}
        compact={
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)' }}>
            Drag to look
          </div>
        }
        expanded={
          <div className="walk-mobile-body">
            {speedRow}
            <div className="walk-touch-pad">
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
            <div className="walk-hint">
              Drag the map to look around. Buttons move at {walkSpeedLabel(speed)} pace.
            </div>
          </div>
        }
      />
    )
  }

  // Desktop floating panel
  return (
    <div className="walk-panel" role="dialog" aria-label="Walk mode">
      <div className="walk-panel-header">
        <Footprints size={14} />
        <span className="walk-panel-title">Walk mode</span>
        <button
          type="button"
          className="walk-panel-close"
          onClick={onClose}
          aria-label="Exit walk mode"
          title="Exit walk mode (Esc)"
        >
          <X size={14} />
        </button>
      </div>
      {speedRow}
      <div className="walk-keys">
        <KeyRow keys={['W', 'A', 'S', 'D']} label="Move" />
        <KeyRow keys={['Q', 'E']} label="Up / down" />
        <KeyRow keys={['Shift']} label="2× sprint" />
        <KeyRow keys={['Drag']} label="Look around" />
        <KeyRow keys={['Esc']} label="Exit" />
      </div>
    </div>
  )
}

function Pad({
  axis,
  onTouchMove,
  children,
}: {
  axis: 'forward' | 'back' | 'left' | 'right' | 'up' | 'down'
  onTouchMove?: WalkWidgetProps['onTouchMove']
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="walk-touch-btn"
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
    <div className="walk-keys-row">
      <div className="walk-keys-keys">
        {keys.map((k) => (
          <kbd key={k} className="walk-key">{k}</kbd>
        ))}
      </div>
      <span className="walk-keys-label">{label}</span>
    </div>
  )
}
