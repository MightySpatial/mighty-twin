/** Terrain section widget — T+1170.
 *
 *  Combined panel with two modes:
 *    - "Section" runs the elevation-profile flow (pick two points,
 *      sample terrain, show chart + stats + 3D overlay)
 *    - "Transparency" exposes the existing globe-transparency knob
 *      (was on its own rail tile in V1; now folded under the Terrain
 *      umbrella since both features are about cutting through terrain)
 */

import { useState } from 'react'
import {
  AlertCircle,
  Copy,
  Loader,
  Mountain,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import ProfileChart from './ProfileChart'
import type { SectionStatus, TerrainSection } from './useTerrain'

interface Props {
  status: SectionStatus
  pickedCount: number
  section: TerrainSection | null
  error: string | null
  isMobile: boolean
  globeAlpha: number
  onSetGlobeAlpha: (a: number) => void
  onStart: () => void
  onCancel: () => void
  onClear: () => void
  onClose: () => void
  onHoverSample: (idx: number | null) => void
}

type Tab = 'section' | 'transparency'

export default function TerrainWidget({
  status,
  pickedCount,
  section,
  error,
  isMobile,
  globeAlpha,
  onSetGlobeAlpha,
  onStart,
  onCancel,
  onClear,
  onClose,
  onHoverSample,
}: Props) {
  const [tab, setTab] = useState<Tab>('section')
  const [copied, setCopied] = useState(false)

  function copyCsv() {
    if (!section) return
    const header = 'distance_m,height_m,longitude,latitude'
    const rows = section.samples.map(
      (s) =>
        `${s.distance.toFixed(2)},${s.height.toFixed(2)},${s.longitude.toFixed(6)},${s.latitude.toFixed(6)}`,
    )
    const csv = [header, ...rows].join('\n')
    navigator.clipboard?.writeText(csv).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      },
      () => undefined,
    )
  }

  return (
    <div
      style={
        isMobile
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '70vh',
              zIndex: 35,
              background: 'rgba(15,15,20,0.97)',
              backdropFilter: 'blur(14px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 14,
              color: '#f0f2f8',
              display: 'flex',
              flexDirection: 'column',
              animation: 'terrainSlide 220ms ease-out',
            }
          : {
              position: 'absolute',
              right: 14,
              top: 110,
              width: 560,
              maxWidth: 'calc(100vw - 28px)',
              zIndex: 35,
              background: 'rgba(15,15,20,0.97)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: 14,
              color: '#f0f2f8',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'terrainFade 160ms ease-out',
            }
      }
    >
      <style>{`
        @keyframes terrainSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes terrainFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Mountain size={16} color="#9bb3ff" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Terrain</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tabs tab={tab} onChange={setTab} />
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
      </div>

      {tab === 'section' && (
        <SectionTab
          status={status}
          pickedCount={pickedCount}
          section={section}
          error={error}
          copied={copied}
          onStart={onStart}
          onCancel={onCancel}
          onClear={onClear}
          onCopyCsv={copyCsv}
          onHoverSample={onHoverSample}
        />
      )}

      {tab === 'transparency' && (
        <TransparencyTab globeAlpha={globeAlpha} onSetGlobeAlpha={onSetGlobeAlpha} />
      )}
    </div>
  )
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 7,
        padding: 2,
      }}
    >
      <TabBtn active={tab === 'section'} onClick={() => onChange('section')}>
        Section
      </TabBtn>
      <TabBtn active={tab === 'transparency'} onClick={() => onChange('transparency')}>
        Transparency
      </TabBtn>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        background: active ? 'rgba(36,83,255,0.20)' : 'transparent',
        border: 'none',
        borderRadius: 5,
        color: active ? '#9bb3ff' : 'rgba(240,242,248,0.55)',
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── Section tab ─────────────────────────────────────────────────────────

function SectionTab({
  status,
  pickedCount,
  section,
  error,
  copied,
  onStart,
  onCancel,
  onClear,
  onCopyCsv,
  onHoverSample,
}: {
  status: SectionStatus
  pickedCount: number
  section: TerrainSection | null
  error: string | null
  copied: boolean
  onStart: () => void
  onCancel: () => void
  onClear: () => void
  onCopyCsv: () => void
  onHoverSample: (idx: number | null) => void
}) {
  // Pre-section / picking states share a CTA pane
  if (!section) {
    const remaining = Math.max(0, 2 - pickedCount)
    return (
      <div>
        {error && (
          <div
            style={{
              padding: 10,
              background: 'rgba(251,113,133,0.06)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 8,
              color: '#fca5a5',
              fontSize: 12,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertCircle size={12} /> {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            background: 'rgba(36,83,255,0.06)',
            border: '1px solid rgba(36,83,255,0.32)',
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Mountain size={20} color="#9bb3ff" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {status === 'idle' && 'Click two points to cross-section the terrain.'}
              {status === 'picking' && remaining > 0 && (
                <>
                  Pick the {pickedCount === 0 ? 'first' : 'second'} point on the
                  globe ({remaining} remaining).
                </>
              )}
              {status === 'sampling' && (
                <>
                  Sampling terrain at 200 intervals…
                </>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
              We sample the live terrain provider and chart elevation vs distance.
            </div>
          </div>
          {status === 'sampling' && <Loader size={16} className="spin" color="#9bb3ff" />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {status === 'idle' && (
            <button onClick={onStart} style={primaryBtn}>
              Start sectioning
            </button>
          )}
          {status === 'picking' && (
            <button onClick={onCancel} style={ghostBtn}>
              Cancel pick
            </button>
          )}
          {status === 'error' && (
            <button onClick={onStart} style={primaryBtn}>
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  // Section ready — chart + stats
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ProfileChart samples={section.samples} onHoverSample={onHoverSample} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
        }}
      >
        <Stat label="Distance" value={fmtDistance(section.stats.distance)} accent="#9bb3ff" />
        <Stat
          label="Range"
          value={`${fmtH(section.stats.maxHeight - section.stats.minHeight)}`}
          sub={`${fmtH(section.stats.minHeight)} – ${fmtH(section.stats.maxHeight)}`}
        />
        <Stat
          label="Ascent / descent"
          value={`+${fmtH(section.stats.ascent)} / -${fmtH(section.stats.descent)}`}
          accent="#34d399"
        />
        <Stat
          label="Slope"
          value={`${section.stats.avgSlope.toFixed(1)}° avg`}
          sub={`${section.stats.maxSlope.toFixed(1)}° max`}
          accent="#f59e0b"
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClear} style={ghostBtn}>
          <Trash2 size={12} /> Clear
        </button>
        <button onClick={onStart} style={ghostBtn}>
          <RefreshCw size={12} /> New section
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onCopyCsv} style={primaryBtn}>
          <Copy size={12} /> {copied ? 'Copied' : 'Copy CSV'}
        </button>
      </div>
    </div>
  )
}

// ── Transparency tab ────────────────────────────────────────────────────

function TransparencyTab({
  globeAlpha,
  onSetGlobeAlpha,
}: {
  globeAlpha: number
  onSetGlobeAlpha: (a: number) => void
}) {
  const pct = Math.round(globeAlpha * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'rgba(240,242,248,0.7)' }}>
        Make the globe surface translucent to peek at subsurface data — useful when
        a 3D-Tiles dataset (BIM model, point cloud, IFC) extends below the
        terrain.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => onSetGlobeAlpha(parseInt(e.target.value, 10) / 100)}
          style={{ flex: 1, accentColor: '#2453ff' }}
        />
        <span
          style={{
            minWidth: 48,
            textAlign: 'right',
            fontSize: 13,
            fontFamily: 'monospace',
            color: '#9bb3ff',
          }}
        >
          {pct}%
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[100, 50, 0].map((p) => (
          <button
            key={p}
            onClick={() => onSetGlobeAlpha(p / 100)}
            style={{
              flex: 1,
              padding: '6px 8px',
              background: pct === p ? 'rgba(36,83,255,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${pct === p ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 6,
              color: pct === p ? '#9bb3ff' : 'rgba(240,242,248,0.7)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {p === 0 ? 'Invisible' : p === 50 ? 'Half' : 'Solid'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div
      style={{
        padding: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 7,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.45)',
          marginBottom: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: accent ?? '#f0f2f8',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(240,242,248,0.45)',
            marginTop: 1,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function fmtH(m: number): string {
  if (Math.abs(m) >= 1000) return `${(m / 1000).toFixed(2)} km`
  if (Math.abs(m) >= 10) return `${m.toFixed(1)} m`
  return `${m.toFixed(2)} m`
}

function fmtDistance(m: number): string {
  if (m >= 10_000) return `${(m / 1000).toFixed(1)} km`
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${m.toFixed(0)} m`
}

const primaryBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
