import type { ProbeState } from './useProbe'
import { X, Crosshair } from 'lucide-react'

interface Props {
  state: ProbeState
  onExit: () => void
}

/** ProbeOverlay — vignette + HUD when probe is active.
 *
 *  Vignette opacity is driven by `state.dampFraction` (0 = no damp, 1 =
 *  at the wall). The vignette radial gradient is rotated to align with
 *  the wall side (perpendicular component of camera-to-centerline
 *  offset). For simplicity v1 the vignette is symmetric (darkens around
 *  the whole edge); directional vignette comes in a follow-up.
 *
 *  HUD shows: t, perpDistance, "PROBE" label, exit button.
 */
export function ProbeOverlay({ state, onExit }: Props) {
  if (!state.active) return null
  const space = state.active
  const radius = space.crossSectionRadiusM ?? 0.5
  const vignetteOpacity = Math.min(0.65, state.dampFraction * 0.65)

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 40,
          background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
          transition: 'background 80ms ease-out',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 42,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(15,17,28,0.92)',
            border: '1px solid rgba(129,140,248,0.4)',
            borderRadius: 8,
            padding: '6px 10px',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            color: '#fff',
            backdropFilter: 'blur(8px)',
            fontFamily: '"SF Mono", Menlo, Consolas, monospace',
            fontSize: 11,
          }}
        >
          <Crosshair size={14} color="#818cf8" />
          <span style={{ color: '#818cf8', fontWeight: 700, letterSpacing: '0.06em' }}>PROBE</span>
          <span style={{ color: 'rgba(255,255,255,0.85)' }}>
            t={state.t.toFixed(2)} · d⊥={state.perpDistance.toFixed(2)}m / {radius.toFixed(2)}m
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit Probe"
          title="Exit Probe (Esc)"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(15,17,28,0.92)',
            color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
        >
          <X size={16} />
        </button>
      </div>
      {space.name && (
        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 42,
            background: 'rgba(15,17,28,0.92)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8,
            padding: '6px 12px',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
          }}
        >
          {space.name}
        </div>
      )}
    </>
  )
}
