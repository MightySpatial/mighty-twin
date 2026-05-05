/** Strike widget UI — T+1110.
 *
 *  Floating panel that walks the user through the three-point pick
 *  and shows the resulting strike / dip / dip-direction once the
 *  third point lands. The hook (useStrike) handles the pick handler
 *  and the on-globe annotation.
 */

import { useEffect } from 'react'
import { Slash, X } from 'lucide-react'
import type { StrikeMeasurement } from './useStrike'

interface Props {
  active: boolean
  pickedCount: number
  measurement: StrikeMeasurement | null
  isMobile: boolean
  onStart: () => void
  onCancel: () => void
  onClear: () => void
  onClose: () => void
}

export default function StrikeWidget({
  active,
  pickedCount,
  measurement,
  isMobile,
  onStart,
  onCancel,
  onClear,
  onClose,
}: Props) {
  useEffect(() => {
    if (!active && !measurement) onStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remaining = Math.max(0, 3 - pickedCount)

  return (
    <div
      style={
        isMobile
          ? {
              position: 'fixed',
              left: 14,
              right: 14,
              bottom: 80,
              zIndex: 30,
              background: 'rgba(15,15,20,0.96)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 14,
              color: '#f0f2f8',
            }
          : {
              position: 'absolute',
              right: 14,
              top: 110,
              width: 280,
              zIndex: 30,
              background: 'rgba(15,15,20,0.96)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 14,
              color: '#f0f2f8',
              boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
            }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Slash size={14} color="#2dd4bf" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Strike & dip</span>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: 4,
            background: 'transparent',
            border: 'none',
            color: 'rgba(240,242,248,0.5)',
            cursor: 'pointer',
            lineHeight: 0,
          }}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {!measurement && (
        <>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(240,242,248,0.65)',
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            Click three points on a planar surface to compute strike azimuth
            and dip angle.
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              background: 'rgba(45,212,191,0.08)',
              border: '1px solid rgba(45,212,191,0.32)',
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#2dd4bf' }}>
                {active
                  ? remaining === 0
                    ? 'Computing…'
                    : `${remaining} point${remaining === 1 ? '' : 's'} left`
                  : 'Click "Start" to begin'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
                {pickedCount} of 3 picked
              </div>
            </div>
            <Dots count={3} active={pickedCount} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!active && (
              <button onClick={onStart} style={primaryBtn}>
                Start
              </button>
            )}
            {active && (
              <button onClick={onCancel} style={ghostBtn}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {measurement && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Stat label="Strike" value={`${formatBearing(measurement.strikeDeg)}`} accent="#2dd4bf" />
            <Stat label="Dip" value={`${measurement.dipDeg.toFixed(1)}°`} accent="#a78bfa" />
            <Stat
              label="Dip direction"
              value={formatBearing(measurement.dipDirectionDeg)}
              accent="#f59e0b"
            />
            <Stat
              label="Notation"
              value={`${pad(measurement.strikeDeg)} / ${measurement.dipDeg.toFixed(0)}°`}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClear} style={ghostBtn}>
              Clear
            </button>
            <button onClick={onStart} style={primaryBtn}>
              Measure another
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: i < active ? '#2dd4bf' : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div
      style={{
        padding: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 7,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.45)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: accent ?? '#f0f2f8',
          fontFamily: 'monospace',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function pad(deg: number): string {
  return Math.round(deg).toString().padStart(3, '0')
}

function formatBearing(deg: number): string {
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(deg / 45) % 8
  return `${pad(deg)}° ${compass[idx]}`
}

const primaryBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 14px',
  background: '#2dd4bf',
  border: 'none',
  borderRadius: 7,
  color: '#0f0f14',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}
