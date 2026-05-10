/**
 * VoxelToolbox — the in-sidebar panel users see when the Voxel tool
 * group is active. Lays out:
 *
 *   ┌─────────────────────────────────┐
 *   │  Tool grid (10 tiles)           │ ← click to arm a tool
 *   ├─────────────────────────────────┤
 *   │  Block level   ▾ 25 cm          │ ← octree level picker
 *   │  Material      ████ ████ ████   │ ← swatch strip
 *   │  Render mode  [Solid|Tex|Ray]   │ ← engine renderMode tabs
 *   ├─────────────────────────────────┤
 *   │  <Active tool's Parameters />   │ ← lazy-loaded per tool
 *   └─────────────────────────────────┘
 *
 * State lives on `useSvoEngine` (activeToolId, activeLevel,
 * activeMaterialType, renderMode). Per-tool parameter forms live in
 * `useVoxelToolParams`.
 */
import { Suspense } from 'react'
import { useSvoEngine } from './useSvoEngine'
import { BASE_BLOCK_SIZE } from './types'
import type { BlockType, SVORenderMode } from './types'
import {
  VOXEL_TOOL_REGISTRY,
  VOXEL_TOOL_ORDER,
  lookupVoxelTool,
} from './tools/voxelRegistry'
import { BLOCK_TYPE_OPTIONS } from './tools/parameters/_shared'

const RENDER_MODES: { id: SVORenderMode; label: string }[] = [
  { id: 'solid',    label: 'Solid' },
  { id: 'textured', label: 'Textured' },
  { id: 'raytrace', label: 'Ray Trace' },
]

/** Build the level dropdown labels: 12.5cm / 25cm / 50cm / 1m / 2m / 4m
 *  / 8m / 16m / 32m / 64m / 128m. Generated from BASE_BLOCK_SIZE × 2^N
 *  so the labels stay correct if the constant ever shifts. */
function levelLabel(level: number): string {
  const m = BASE_BLOCK_SIZE * Math.pow(2, level)
  if (m < 1) return `${(m * 100).toFixed(m * 100 < 10 ? 1 : 0)} cm`
  return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)} m`
}

const LEVEL_OPTIONS = Array.from({ length: 11 }, (_, i) => ({
  value: i,
  label: levelLabel(i),
}))

export default function VoxelToolbox() {
  const activeToolId   = useSvoEngine(s => s.activeToolId)
  const setActiveTool  = useSvoEngine(s => s.setActiveTool)
  const activeLevel    = useSvoEngine(s => s.activeLevel)
  const setActiveLevel = useSvoEngine(s => s.setActiveLevel)
  const activeMat      = useSvoEngine(s => s.activeMaterialType)
  const setActiveMat   = useSvoEngine(s => s.setActiveMaterialType)
  const renderMode     = useSvoEngine(s => s.renderMode)
  const setRenderMode  = useSvoEngine(s => s.setRenderMode)
  const activeLayer    = useSvoEngine(s =>
    s.activeLayerId ? s.layers.find(l => l.id === s.activeLayerId) ?? null : null,
  )

  const tool = lookupVoxelTool(activeToolId)

  function pickTool(id: string) {
    setActiveTool(activeToolId === id ? null : id)
  }

  function pickMaterial(type: BlockType) {
    setActiveMat(type)
  }

  if (!activeLayer) {
    return (
      <div className="vx-toolbox vx-toolbox--empty">
        <p>Pick or create a voxel layer first.</p>
        <p className="vx-toolbox__hint">Voxel tools need a layer with a datum to anchor the ENU grid.</p>
      </div>
    )
  }

  return (
    <div className="vx-toolbox">
      {/* Tool grid */}
      <div className="vx-tool-grid" role="toolbar" aria-label="Voxel tools">
        {VOXEL_TOOL_ORDER.map(toolId => {
          const t = VOXEL_TOOL_REGISTRY[toolId]
          if (!t) return null
          const active = activeToolId === toolId
          return (
            <button
              key={toolId}
              type="button"
              className={`vx-tool-btn${active ? ' is-active' : ''}`}
              onClick={() => pickTool(toolId)}
              title={t.label}
              aria-pressed={active}
            >
              <svg viewBox="0 0 16 16" className="vx-tool-icon" aria-hidden>
                <path d={t.icon} fill="currentColor" />
              </svg>
              <span className="vx-tool-label">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Editor settings */}
      <div className="vx-settings">
        <div className="dw-row">
          <label className="dw-section-label" htmlFor="vx-level-select">Block level</label>
          <select
            id="vx-level-select"
            className="dw-select"
            value={activeLevel}
            onChange={e => setActiveLevel(Number(e.target.value))}
          >
            {LEVEL_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                Level {o.value} · {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dw-row">
          <label className="dw-section-label">Material palette</label>
          <div className="vx-palette" role="radiogroup" aria-label="Active material">
            {BLOCK_TYPE_OPTIONS.filter(o => o.value !== 'air').map(o => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={activeMat === o.value}
                className={`vx-swatch${activeMat === o.value ? ' is-on' : ''}`}
                style={{ background: o.colour }}
                onClick={() => pickMaterial(o.value)}
                title={o.label}
              >
                <span className="vx-swatch-label">{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dw-row">
          <label className="dw-section-label">Render mode</label>
          <div className="vx-render-tabs" role="tablist">
            {RENDER_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={renderMode === m.id}
                className={`vx-render-tab${renderMode === m.id ? ' is-on' : ''}`}
                onClick={() => setRenderMode(m.id)}
              >{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Active tool params */}
      {tool && (
        <div className="vx-tool-params">
          <div className="vx-tool-params__hd">
            <svg viewBox="0 0 16 16" className="vx-tool-icon" aria-hidden>
              <path d={tool.icon} fill="currentColor" />
            </svg>
            <strong>{tool.label}</strong>
            <button
              type="button"
              className="vx-tool-params__cancel"
              onClick={() => setActiveTool(null)}
              aria-label="Cancel tool"
              title="Cancel (ESC)"
            >×</button>
          </div>
          {tool.parameters && (
            <Suspense fallback={<div className="vx-tool-params__loading">Loading…</div>}>
              {(() => {
                const Params = tool.parameters
                return <Params hint={tool.hint} />
              })()}
            </Suspense>
          )}
          {!tool.parameters && (
            <p className="vx-tool-hint">{tool.hint}</p>
          )}
        </div>
      )}

      {!tool && (
        <p className="vx-toolbox__hint">
          Pick a tool above to begin. Press ESC to cancel anytime.
        </p>
      )}
    </div>
  )
}
