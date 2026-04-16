/**
 * MightyTwin — Draw Panel
 * Tool buttons for point/line/polygon/rectangle/circle,
 * elevation mode toggle, and placing-mode bar.
 */
import type { Viewer as CesiumViewerType } from 'cesium'
import type { DesignTool, ElevationConfig, ElevationDatum, SketchFeature, SketchLayer, BoxDraft, PitDraft, CylDraft, TraverseDraft } from '../types'
import { usePointTool } from '../tools/usePointTool'
import { useLineTool } from '../tools/useLineTool'
import { usePolygonTool } from '../tools/usePolygonTool'
import { useRectTool } from '../tools/useRectTool'
import { useCircleTool } from '../tools/useCircleTool'
import { useTraverseTool } from '../tools/useTraverseTool'
import TraversePanel from './TraversePanel'
import type { SolidDraft } from '../types'
import { SolidBoxForm, SolidPitForm, SolidCylForm } from './SolidForms'

interface DrawPanelProps {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayer: SketchLayer | undefined
  onSetTool: (tool: DesignTool) => void
  onSetElevation: (config: ElevationConfig) => void
  onCancelTool: () => void
  onFeatureAdded: (feature: SketchFeature) => void
  solidDraft: SolidDraft | null
  onSolidDraftChange: (draft: SolidDraft | null) => void
  onConfirmSolid: () => void
  onCancelSolid: () => void
  traverseDraft: TraverseDraft | null
  onTraverseDraftChange: (draft: TraverseDraft | null) => void
}

const DRAW_TOOLS: { id: Exclude<DesignTool, null | 'select' | 'box' | 'pit' | 'cylinder'>; icon: string; label: string; hint: string; shortcut?: string }[] = [
  { id: 'point',     icon: '●',  label: 'Point',     hint: 'Click to place a point',                              shortcut: 'P' },
  { id: 'line',      icon: '╱',  label: 'Line',      hint: 'Click to add vertices. Double-click or Enter to finish', shortcut: 'L' },
  { id: 'polygon',   icon: '⬡',  label: 'Polygon',   hint: 'Click to add vertices. Double-click or Enter to close',  shortcut: 'G' },
  { id: 'rectangle', icon: '▣',  label: 'Rectangle', hint: 'Click first corner, then click opposite corner',       shortcut: 'R' },
  { id: 'circle',    icon: '◯',  label: 'Circle',    hint: 'Click center, then click to set radius',              shortcut: 'C' },
  { id: 'traverse',  icon: '⟁',  label: 'Traverse',  hint: 'Click start point, add bearing+distance legs' },
]

const SOLID_TOOLS: { id: 'box' | 'pit' | 'cylinder'; icon: string; label: string; hint: string }[] = [
  { id: 'box',       icon: '⬚',  label: 'Box',       hint: 'Click to place a box solid' },
  { id: 'pit',       icon: '⊔',  label: 'Pit',       hint: 'Click to place an open-top pit' },
  { id: 'cylinder',  icon: '⊙',  label: 'Cylinder',  hint: 'Click to place a cylinder solid' },
]

const ALL_TOOLS = [...DRAW_TOOLS, ...SOLID_TOOLS]

const ELEVATION_DATUMS: { id: ElevationDatum; label: string; desc: string }[] = [
  { id: 'terrain',        label: 'Terrain',             desc: 'Snap to terrain surface' },
  { id: 'ellipsoid',      label: 'Sea Level Ellipsoid',  desc: 'WGS84 ellipsoid, height above sea level' },
  { id: 'mga2020',        label: 'MGA2020',              desc: 'Map Grid of Australia 2020 (GDA2020 ellipsoid)' },
  { id: 'custom_terrain', label: 'Custom Terrain',       desc: 'Use terrain loaded via the Terrain widget' },
]

export default function DrawPanel({
  viewer,
  activeTool,
  elevationConfig,
  activeLayer,
  onSetTool,
  onSetElevation,
  onCancelTool,
  onFeatureAdded,
  solidDraft,
  onSolidDraftChange,
  onConfirmSolid,
  onCancelSolid,
  traverseDraft,
  onTraverseDraftChange,
}: DrawPanelProps) {
  const layerColour = activeLayer?.colour ?? '#94a3b8'
  const activeLayerId = activeLayer?.id ?? ''

  const toolOpts = {
    viewer,
    activeTool,
    elevationConfig,
    activeLayerId,
    layerColour,
    onFeatureAdded,
  }

  usePointTool(toolOpts)
  const { vertexCount: lineVertexCount } = useLineTool(toolOpts)
  const { vertexCount: polygonVertexCount } = usePolygonTool(toolOpts)
  useRectTool(toolOpts)
  useCircleTool(toolOpts)
  const { commitTraverse, clearTraverse } = useTraverseTool({
    ...toolOpts,
    traverseDraft,
    onTraverseDraftChange,
  })

  // Keyboard shortcuts handled by useDesignState (P, L, G, R, C, ESC)

  const activeToolMeta = ALL_TOOLS.find(t => t.id === activeTool)
  const isSolid = activeTool === 'box' || activeTool === 'pit' || activeTool === 'cylinder'

  const currentVertexCount = activeTool === 'line' ? lineVertexCount : activeTool === 'polygon' ? polygonVertexCount : 0

  return (
    <div className="draw-panel">
      {/* Empty state — no layers */}
      {!activeLayer && (
        <div className="draw-empty-state">
          <p>Add a layer in Layers tab to start drawing</p>
        </div>
      )}

      {/* Placing-mode bar */}
      {activeTool && activeToolMeta && (
        <div className="draw-placing-bar">
          <span className="draw-placing-icon">{activeToolMeta.icon}</span>
          <span className="draw-placing-label">
            Placing <strong>{activeToolMeta.label}</strong>
          </span>
          <span className="draw-placing-hint">
            {solidDraft ? 'Adjust params below, then Place' : activeToolMeta.hint}
          </span>
          {currentVertexCount > 0 && (
            <span className="draw-vertex-count">
              {currentVertexCount} {currentVertexCount === 1 ? 'vertex' : 'vertices'}
            </span>
          )}
          <button
            className="draw-placing-cancel"
            onClick={() => { if (isSolid) onCancelSolid(); onCancelTool(); }}
            title="Cancel (ESC)"
          >
            ×
          </button>
        </div>
      )}

      {/* Draw Tool buttons */}
      <div className="draw-tools-section">
        <div className="draw-section-label">Draw Tools</div>
        <div className="draw-tools-grid">
          {DRAW_TOOLS.map(tool => (
            <button
              key={tool.id}
              className={`draw-tool-btn${activeTool === tool.id ? ' active' : ''}${!activeLayer ? ' disabled' : ''}`}
              onClick={() => onSetTool(activeTool === tool.id ? null : tool.id)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              disabled={!activeLayer || activeLayer.locked || !activeLayer.visible}
            >
              <span className="draw-tool-icon">{tool.icon}</span>
              <span className="draw-tool-label">{tool.label}</span>
              {tool.shortcut && <kbd className="draw-tool-shortcut">{tool.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>

      {/* Solid Tool buttons */}
      <div className="draw-tools-section">
        <div className="draw-section-label">Solid Tools</div>
        <div className="draw-tools-grid">
          {SOLID_TOOLS.map(tool => (
            <button
              key={tool.id}
              className={`draw-tool-btn${activeTool === tool.id ? ' active' : ''}`}
              onClick={() => {
                if (activeTool === tool.id) { onCancelSolid(); onSetTool(null); }
                else { onCancelSolid(); onSetTool(tool.id); }
              }}
              title={tool.label}
              disabled={!activeLayer || activeLayer.locked || !activeLayer.visible}
            >
              <span className="draw-tool-icon">{tool.icon}</span>
              <span className="draw-tool-label">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Solid draft params form */}
      {isSolid && !solidDraft && (
        <p className="draw-hint">Click on the globe to place</p>
      )}

      {isSolid && solidDraft && activeTool === 'box' && (
        <SolidBoxForm draft={solidDraft as BoxDraft} onChange={onSolidDraftChange} onPlace={onConfirmSolid} onCancel={onCancelSolid} />
      )}
      {isSolid && solidDraft && activeTool === 'pit' && (
        <SolidPitForm draft={solidDraft as PitDraft} onChange={onSolidDraftChange} onPlace={onConfirmSolid} onCancel={onCancelSolid} />
      )}
      {isSolid && solidDraft && activeTool === 'cylinder' && (
        <SolidCylForm draft={solidDraft as CylDraft} onChange={onSolidDraftChange} onPlace={onConfirmSolid} onCancel={onCancelSolid} />
      )}

      {/* Traverse panel */}
      {activeTool === 'traverse' && (
        <TraversePanel
          draft={traverseDraft}
          onDraftChange={onTraverseDraftChange}
          onCommit={commitTraverse}
          onClear={clearTraverse}
        />
      )}

      {/* Elevation datum */}
      <div className="draw-elevation-section">
        <div className="draw-section-label">Elevation Datum</div>
        <select
          className="draw-elevation-select"
          value={elevationConfig.datum}
          onChange={e => onSetElevation({ ...elevationConfig, datum: e.target.value as ElevationDatum })}
        >
          {ELEVATION_DATUMS.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        <p className="draw-elevation-desc">
          {ELEVATION_DATUMS.find(d => d.id === elevationConfig.datum)?.desc}
        </p>
        <div className="draw-offset-row">
          <label className="draw-section-label" htmlFor="elev-offset">Offset (m)</label>
          <input
            id="elev-offset"
            className="draw-offset-input"
            type="number"
            step="0.001"
            value={elevationConfig.offset}
            onChange={e => onSetElevation({ ...elevationConfig, offset: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Active layer indicator */}
      {activeLayer && (
        <div className="draw-active-layer">
          <span className="draw-section-label">Drawing to</span>
          <span className="draw-layer-badge">
            <span className="draw-layer-dot" style={{ background: activeLayer.colour }} />
            {activeLayer.name}
          </span>
          {activeLayer.locked && (
            <span className="draw-layer-locked">Layer locked</span>
          )}
          {!activeLayer.visible && !activeLayer.locked && (
            <span className="draw-layer-locked">Layer hidden</span>
          )}
        </div>
      )}

      {!activeTool && (
        <p className="draw-hint">
          Select a tool above to start drawing. Press ESC to cancel at any time.
        </p>
      )}
    </div>
  )
}

