/** Terrain section widget — T+1170.
 *
 *  Combined panel with two modes:
 *    - "Section" runs the elevation-profile flow (pick two points,
 *      sample terrain, show chart + stats + 3D overlay)
 *    - "Transparency" exposes the existing globe-transparency knob
 *      (was on its own rail tile in V1; now folded under the Terrain
 *      umbrella since both features are about cutting through terrain)
 */

import { useState, useCallback } from 'react'
import {
  AlertCircle,
  ArrowDownToLine,
  Copy,
  Eye,
  Hexagon,
  Layers,
  Loader,
  Mountain,
  MousePointer,
  RefreshCw,
  Route,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'
import ProfileChart from './ProfileChart'
import type { SectionStatus, TerrainSection, LineEndpoints } from './useTerrain'
import type { UndergroundState } from './useUnderground'
import type { UseTerrainMaskApi } from './useTerrainMask'
import { Cartographic, JulianDate, Math as CesiumMath } from 'cesium'
import type { Viewer as CesiumViewerType } from 'cesium'

/** A line-type layer from the layers list that can be used as a section source. */
export interface LineLayer {
  id: string
  name: string
}

interface Props {
  status: SectionStatus
  pickedCount: number
  section: TerrainSection | null
  error: string | null
  isMobile: boolean
  /** When true, renders as an inline panel (no absolute positioning)
   *  for embedding inside the sidebar. */
  sidebarMode?: boolean
  globeAlpha: number
  onSetGlobeAlpha: (a: number) => void
  onStart: () => void
  /** Start a section from two known endpoints (skip click-to-pick). */
  onStartFromLine: (line: LineEndpoints) => void
  onCancel: () => void
  onClear: () => void
  onClose: () => void
  onHoverSample: (idx: number | null) => void
  /** Cesium viewer ref — used to read sketch polylines and selected entity. */
  viewerRef?: React.MutableRefObject<CesiumViewerType | null>
  /** Vector layers available as section line sources. */
  lineLayers?: LineLayer[]
  // Underground (T+1230)
  underground: UndergroundState
  onUndergroundEnable: () => void
  onUndergroundDisable: () => void
  onUndergroundSet: (patch: Partial<UndergroundState>) => void
  onUndergroundReset: () => void
  /** Mask tab API — when omitted, the Mask tab is hidden (mobile-only
   *  fallback path). Wired in CesiumViewer via useTerrainMask. */
  mask?: UseTerrainMaskApi
  /** True when the design widget has an active voxel layer with
   *  loaded bounds. Used to enable/disable the "Use voxel as mask"
   *  button in the Mask tab. */
  hasVoxelBounds?: boolean
  /** Called when the user clicks "Use voxel layer as mask". The host
   *  resolves the active voxel layer's footprint and feeds it back
   *  into the mask via mask.setMaskFromPositions(). */
  onUseVoxelAsMask?: () => void
  /** Optional — when provided, the Mask tab surfaces a "Save as
   *  default for this site" button that persists the current mask
   *  to site.config.terrain_mask_geojson via the host. */
  onSaveMaskAsSiteDefault?: () => Promise<void> | void
}

type Tab = 'section' | 'mask' | 'underground' | 'transparency'

export default function TerrainWidget({
  status,
  pickedCount,
  section,
  error,
  isMobile,
  sidebarMode = false,
  globeAlpha,
  onSetGlobeAlpha,
  onStart,
  onStartFromLine,
  onCancel,
  onClear,
  onClose,
  onHoverSample,
  viewerRef,
  lineLayers = [],
  underground,
  onUndergroundEnable,
  onUndergroundDisable,
  onUndergroundSet,
  onUndergroundReset,
  mask,
  hasVoxelBounds = false,
  onUseVoxelAsMask,
  onSaveMaskAsSiteDefault,
}: Props) {
  const [tab, setTab] = useState<Tab>('section')
  const [copied, setCopied] = useState(false)
  const [assetMode, setAssetMode] = useState(false)

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

  const containerStyle: React.CSSProperties = sidebarMode
    ? {
        // Inline sidebar panel — fills available height, no floating chrome
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#f0f2f8',
        overflow: 'hidden',
      }
    : isMobile
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

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes terrainSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes terrainFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header — compact in sidebar mode */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: sidebarMode ? '10px 12px 8px' : '0 0 12px',
          borderBottom: sidebarMode ? '1px solid rgba(255,255,255,0.06)' : 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Mountain size={14} color="#9bb3ff" />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)' }}>Terrain</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tabs tab={tab} onChange={setTab} />
          {!sidebarMode && (
            <button
              onClick={onClose}
              style={{ padding: 4, background: 'transparent', border: 'none', color: 'rgba(240,242,248,0.5)', cursor: 'pointer', lineHeight: 0 }}
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: sidebarMode ? '10px 12px' : 0 }}>
      {tab === 'section' && (
        <SectionTab
          status={status}
          pickedCount={pickedCount}
          section={section}
          error={error}
          copied={copied}
          assetMode={assetMode}
          onToggleAssetMode={() => setAssetMode(a => !a)}
          viewerRef={viewerRef}
          onStart={onStart}
          onStartFromLine={onStartFromLine}
          onCancel={onCancel}
          onClear={onClear}
          onCopyCsv={copyCsv}
          onHoverSample={onHoverSample}
        />
      )}

      {tab === 'underground' && (
        <UndergroundTab
          state={underground}
          onEnable={onUndergroundEnable}
          onDisable={onUndergroundDisable}
          onSet={onUndergroundSet}
          onReset={onUndergroundReset}
        />
      )}

      {tab === 'mask' && mask && (
        <MaskTab
          mask={mask}
          hasVoxelBounds={hasVoxelBounds}
          onUseVoxelAsMask={onUseVoxelAsMask}
          onSaveMaskAsSiteDefault={onSaveMaskAsSiteDefault}
        />
      )}

      {tab === 'transparency' && (
        <TransparencyTab globeAlpha={globeAlpha} onSetGlobeAlpha={onSetGlobeAlpha} />
      )}
      </div>
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
      <TabBtn active={tab === 'mask'} onClick={() => onChange('mask')}>
        Mask
      </TabBtn>
      <TabBtn active={tab === 'underground'} onClick={() => onChange('underground')}>
        Underground
      </TabBtn>
      <TabBtn active={tab === 'transparency'} onClick={() => onChange('transparency')}>
        Transparency
      </TabBtn>
    </div>
  )
}

/** Mask tab — polygon draw + voxel borrow + clear. The actual scene
 *  clipping is wired by `useTerrainMask`; this is just the UI shell. */
function MaskTab({
  mask,
  hasVoxelBounds,
  onUseVoxelAsMask,
  onSaveMaskAsSiteDefault,
}: {
  mask: UseTerrainMaskApi
  hasVoxelBounds: boolean
  onUseVoxelAsMask?: () => void
  onSaveMaskAsSiteDefault?: () => Promise<void> | void
}) {
  const drawingState = mask.state.kind === 'drawing' ? mask.state : null
  const setState_ = mask.state.kind === 'set' ? mask.state : null
  const drawing = drawingState !== null
  const set = setState_ !== null
  const draftCount = drawingState ? drawingState.positions.length : 0
  const source = setState_?.source ?? null
  const setVertexCount = setState_?.positions.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{
        margin: 0,
        fontSize: 11,
        color: 'rgba(230,237,243,0.6)',
        lineHeight: 1.45,
      }}>
        Cut a hole through the terrain (and any 3D tilesets) so you
        can see what's underneath — for inspecting underground
        utilities, voxel models, or subsurface layers.
      </p>

      {/* Status pill */}
      <div style={{
        padding: '6px 10px',
        background: set
          ? 'rgba(45,212,191,0.10)'
          : drawing ? 'rgba(96,165,250,0.10)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${set
          ? 'rgba(45,212,191,0.3)'
          : drawing ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 6,
        fontSize: 11,
        color: set ? '#2dd4bf' : drawing ? '#60a5fa' : 'rgba(230,237,243,0.6)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <Scissors size={12} />
        {set && (
          <>Mask active — {setVertexCount} vertices · source: {source}</>
        )}
        {drawing && (
          <>Drawing — {draftCount} {draftCount === 1 ? 'vertex' : 'vertices'} · right-click or double-click to finish</>
        )}
        {!set && !drawing && <>No mask.</>}
      </div>

      {/* Primary action */}
      {!drawing && (
        <button
          type="button"
          onClick={mask.startDrawing}
          style={maskBtnStyle('primary')}
        >
          <MousePointer size={12} />
          {set ? 'Replace with new polygon' : 'Draw mask polygon'}
        </button>
      )}
      {drawing && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={mask.finishDrawing}
            disabled={draftCount < 3}
            style={{ ...maskBtnStyle('primary'), flex: 1, opacity: draftCount < 3 ? 0.4 : 1 }}
          >
            Finish ({draftCount} pts)
          </button>
          <button
            type="button"
            onClick={mask.cancelDrawing}
            style={{ ...maskBtnStyle('ghost'), flex: 0 }}
            aria-label="Cancel drawing"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Voxel-as-mask — only enabled when the design widget has an
          active voxel layer with loaded chunks. Falls back to a
          disabled state with a hint so users know to open the
          design widget first. */}
      <button
        type="button"
        onClick={onUseVoxelAsMask}
        disabled={!hasVoxelBounds || drawing}
        style={{
          ...maskBtnStyle('secondary'),
          opacity: (!hasVoxelBounds || drawing) ? 0.4 : 1,
          cursor: (!hasVoxelBounds || drawing) ? 'not-allowed' : 'pointer',
        }}
        title={hasVoxelBounds
          ? 'Use the active voxel layer\'s footprint as the mask'
          : 'Open the Design widget and load a voxel layer first'}
      >
        <Hexagon size={12} />
        Use voxel layer as mask
      </button>

      {set && onSaveMaskAsSiteDefault && (
        <button
          type="button"
          onClick={() => { void onSaveMaskAsSiteDefault() }}
          style={maskBtnStyle('secondary')}
          title="Persist this mask to the site so every viewer sees it on load"
        >
          <ArrowDownToLine size={12} />
          Save as default for this site
        </button>
      )}

      {set && (
        <button
          type="button"
          onClick={mask.clear}
          style={{ ...maskBtnStyle('ghost'), width: 'auto', padding: '0 10px' }}
        >
          <Trash2 size={12} />
          Clear mask
        </button>
      )}
    </div>
  )
}

function maskBtnStyle(variant: 'primary' | 'secondary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 30,
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 500,
    transition: 'background 120ms',
  }
  switch (variant) {
    case 'primary':
      return {
        ...base,
        background: 'rgba(45,212,191,0.16)',
        borderColor: 'rgba(45,212,191,0.3)',
        color: '#2dd4bf',
      }
    case 'secondary':
      return {
        ...base,
        background: 'rgba(96,165,250,0.10)',
        borderColor: 'rgba(96,165,250,0.25)',
        color: '#60a5fa',
      }
    case 'ghost':
      return {
        ...base,
        background: 'transparent',
        borderColor: 'rgba(255,255,255,0.10)',
        color: 'rgba(230,237,243,0.7)',
        width: 36,
      }
  }
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

type LineSource = 'pick' | 'sketch' | 'selected'

// ── Section tab ─────────────────────────────────────────────────────────

function SectionTab({
  status,
  pickedCount,
  section,
  error,
  copied,
  assetMode,
  onToggleAssetMode,
  viewerRef,
  onStart,
  onStartFromLine,
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
  assetMode: boolean
  onToggleAssetMode: () => void
  viewerRef?: React.MutableRefObject<CesiumViewerType | null>
  onStart: () => void
  onStartFromLine: (line: LineEndpoints) => void
  onCancel: () => void
  onClear: () => void
  onCopyCsv: () => void
  onHoverSample: (idx: number | null) => void
}) {
  const [source, setSource] = useState<LineSource>('pick')

  // Try to run a section from a selected entity or sketch line.
  const runFromSource = useCallback(() => {
    const viewer = viewerRef?.current
    if (!viewer) return
    try {
      const now = JulianDate.now()
      if (source === 'selected') {
        const sel = viewer.selectedEntity
        if (!sel?.polyline) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const positions = sel.polyline.positions?.getValue(now) as any[]
        if (!positions || positions.length < 2) return
        const a = Cartographic.fromCartesian(positions[0])
        const b = Cartographic.fromCartesian(positions[positions.length - 1])
        onStartFromLine({
          start: { longitude: CesiumMath.toDegrees(a.longitude), latitude: CesiumMath.toDegrees(a.latitude) },
          end: { longitude: CesiumMath.toDegrees(b.longitude), latitude: CesiumMath.toDegrees(b.latitude) },
        })
      } else if (source === 'sketch') {
        // Find the first polyline entity whose name suggests it's a sketch
        const sketches = viewer.entities.values.filter(
          e => e.polyline && (e.name?.toLowerCase().includes('sketch') || e.name?.toLowerCase().includes('line')),
        )
        if (sketches.length === 0) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const positions = sketches[0].polyline!.positions?.getValue(now) as any[]
        if (!positions || positions.length < 2) return
        const a = Cartographic.fromCartesian(positions[0])
        const b = Cartographic.fromCartesian(positions[positions.length - 1])
        onStartFromLine({
          start: { longitude: CesiumMath.toDegrees(a.longitude), latitude: CesiumMath.toDegrees(a.latitude) },
          end: { longitude: CesiumMath.toDegrees(b.longitude), latitude: CesiumMath.toDegrees(b.latitude) },
        })
      }
    } catch { /* entity read failed */ }
  }, [source, viewerRef, onStartFromLine])

  // Pre-section / picking states share a CTA pane
  if (!section) {
    const remaining = Math.max(0, 2 - pickedCount)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Line source selector */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 2, gap: 2 }}>
          {([
            { id: 'pick', icon: <MousePointer size={11} />, label: 'Pick' },
            { id: 'sketch', icon: <Route size={11} />, label: 'Sketch' },
            { id: 'selected', icon: <Layers size={11} />, label: 'Selected' },
          ] as { id: LineSource; icon: React.ReactNode; label: string }[]).map(s => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              style={{
                flex: 1,
                padding: '5px 6px',
                background: source === s.id ? 'rgba(36,83,255,0.22)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: source === s.id ? '#9bb3ff' : 'rgba(240,242,248,0.55)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: 10, background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.32)', borderRadius: 8, color: '#fca5a5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(36,83,255,0.06)', border: '1px solid rgba(36,83,255,0.32)', borderRadius: 10 }}>
          <Mountain size={20} color="#9bb3ff" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {source === 'pick' && status === 'idle' && 'Click two points to cross-section.'}
              {source === 'pick' && status === 'picking' && remaining > 0 && (
                <>Pick the {pickedCount === 0 ? 'first' : 'second'} point ({remaining} left).</>
              )}
              {source === 'pick' && status === 'sampling' && 'Sampling terrain…'}
              {source === 'sketch' && 'Use the first sketch line from the Design widget.'}
              {source === 'selected' && 'Click a line feature on the map, then run.'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
              {source === 'pick' ? 'Samples the live terrain provider at 200 intervals.' : 'Section runs end-to-end along the chosen geometry.'}
            </div>
          </div>
          {status === 'sampling' && <Loader size={16} className="spin" color="#9bb3ff" />}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {source === 'pick' ? (
            <>
              {status === 'idle' && <button onClick={onStart} style={primaryBtn}>Start sectioning</button>}
              {status === 'picking' && <button onClick={onCancel} style={ghostBtn}>Cancel pick</button>}
              {status === 'error' && <button onClick={onStart} style={primaryBtn}><RefreshCw size={12} /> Retry</button>}
            </>
          ) : (
            <button onClick={runFromSource} style={primaryBtn}><Route size={12} /> Run section</button>
          )}
        </div>
      </div>
    )
  }

  // Section ready — chart + stats
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Asset mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
        <span style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)' }}>Asset intersections</span>
        <button
          onClick={onToggleAssetMode}
          style={{
            padding: '3px 10px',
            background: assetMode ? 'rgba(36,83,255,0.20)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${assetMode ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 6,
            color: assetMode ? '#9bb3ff' : 'rgba(240,242,248,0.55)',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {assetMode ? 'On' : 'Off'}
        </button>
      </div>
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

// ── Underground tab ─────────────────────────────────────────────────────

function UndergroundTab({
  state,
  onEnable,
  onDisable,
  onSet,
  onReset,
}: {
  state: UndergroundState
  onEnable: () => void
  onDisable: () => void
  onSet: (patch: Partial<UndergroundState>) => void
  onReset: () => void
}) {
  const enabled = state.enabled
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Master toggle card */}
      <div
        style={{
          padding: 12,
          background: enabled ? 'rgba(167,139,250,0.10)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${enabled ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: enabled ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: enabled ? '#c4b5fd' : 'rgba(240,242,248,0.5)',
            flexShrink: 0,
          }}
        >
          <ArrowDownToLine size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Underground mode</div>
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
            Translucent globe + reference floor + x-ray through terrain.
          </div>
        </div>
        <ToggleSwitch
          checked={enabled}
          onChange={(v) => (v ? onEnable() : onDisable())}
        />
      </div>

      {/* Floor controls — only meaningful when underground is on */}
      <div
        style={{
          opacity: enabled ? 1 : 0.5,
          pointerEvents: enabled ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Row label="Show floor">
          <ToggleSwitch
            checked={state.floorEnabled}
            onChange={(v) => onSet({ floorEnabled: v })}
          />
        </Row>

        <SliderRow
          label="Depth"
          value={Math.abs(state.floorDepth)}
          min={5}
          max={500}
          step={5}
          unit="m"
          onChange={(v) => onSet({ floorDepth: -v })}
        />

        <SliderRow
          label="Floor opacity"
          value={Math.round(state.floorOpacity * 100)}
          min={20}
          max={100}
          step={1}
          unit="%"
          onChange={(v) => onSet({ floorOpacity: v / 100 })}
        />

        <Row label="X-ray terrain" sub="Subsurface 3D-Tiles render through the globe">
          <ToggleSwitch
            checked={state.xrayTerrain}
            onChange={(v) => onSet({ xrayTerrain: v })}
          />
        </Row>
      </div>

      <button
        onClick={onReset}
        style={{
          padding: '7px 12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 7,
          color: 'rgba(240,242,248,0.7)',
          fontSize: 11,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Eye size={11} /> Reset to surface mode
      </button>
    </div>
  )
}

function Row({
  label,
  sub,
  children,
}: {
  label: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 10, color: 'rgba(240,242,248,0.45)', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div
      style={{
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#c4b5fd',
          }}
        >
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#a78bfa' }}
      />
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        background: checked ? '#a78bfa' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 160ms',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 160ms',
        }}
      />
    </button>
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
