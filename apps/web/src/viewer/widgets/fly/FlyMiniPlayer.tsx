/** Mobile-only compact bar pinned to the bottom of the viewport.
 *
 *  Replaces the legacy MiniPlayer / touch-pad layout on phones —
 *  locomotion is driven by canvas gestures (useFlyTouchGestures), so
 *  the bar just exposes the controls the gestures can't:
 *
 *    - Plane icon + "Fly" title
 *    - Current gear name (e.g. "Driving · 60 km/h")
 *    - − and + buttons to shift gears (also achievable via pinch)
 *    - ON / OFF toggle to enter or exit fly mode
 *
 *  Styled like a media player — full-width, low-chrome, glass blur.
 *  Designed to coexist with the bottom safe-area inset on iOS so the
 *  home indicator doesn't overlap the controls. */

import { Plane, ChevronLeft, ChevronRight } from 'lucide-react'
import type { FlySpeed } from '../../components/CesiumViewer/hooks/useFlyMode'
import {
  FLY_SPEEDS,
  flySpeedLabel,
  flySpeedMps,
  flySpeedIndex,
} from '../../components/CesiumViewer/hooks/useFlyMode'
import './FlyMiniPlayer.css'

export interface FlyMiniPlayerProps {
  speed: FlySpeed
  active: boolean
  onShift: (delta: 1 | -1) => void
  onToggleActive: () => void
}

export default function FlyMiniPlayer({
  speed,
  active,
  onShift,
  onToggleActive,
}: FlyMiniPlayerProps) {
  const idx = flySpeedIndex(speed)
  const mps = flySpeedMps(speed)
  const kmh = mps * 3.6
  return (
    <div className="fly-mini" role="region" aria-label="Fly controls">
      <div className="fly-mini__title">
        <Plane size={14} />
        <span>Fly</span>
      </div>
      <button
        type="button"
        className="fly-mini__shift"
        aria-label="Shift down"
        title="Shift down"
        onClick={() => onShift(-1)}
        disabled={idx === 0}
      >
        <ChevronLeft size={16} />
      </button>
      <div className="fly-mini__gear">
        <span className="fly-mini__gear-name">{flySpeedLabel(speed)}</span>
        <span className="fly-mini__gear-sub">{kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)} km/h</span>
      </div>
      <button
        type="button"
        className="fly-mini__shift"
        aria-label="Shift up"
        title="Shift up"
        onClick={() => onShift(1)}
        disabled={idx === FLY_SPEEDS.length - 1}
      >
        <ChevronRight size={16} />
      </button>
      <button
        type="button"
        className={`fly-mini__toggle${active ? ' is-on' : ' is-off'}`}
        aria-pressed={active}
        onClick={onToggleActive}
      >
        {active ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
