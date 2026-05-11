/**
 * SketchTab — tool grid + Cesium pick handler + template chip browser.
 *
 * Top: registry-driven grid of tools, grouped per TOOL_GROUPS.
 * Click a tile → setActiveTool(id) → PlaceModeBar mounts (in the shell)
 * → user clicks the globe → useToolPicks streams positions into the
 * draft node → tool spec's clicksToFinish governs auto-commit.
 *
 * Above the grid: template browser chips. Filtered to the active
 * tool's geometry kind, or — when no tool is active — grouped by their
 * own `geometry` field. Clicking a chip stamps `activeTemplateId` and
 * auto-activates a sensible default tool for that geometry (the
 * matching tool in the registry, e.g. point→`point`, line→`line`).
 *
 * Below the grid (when no tool active): "select a tool to begin" hint.
 */
import { useEffect, useMemo } from 'react'
import { useCadEngine } from '../../sketch/useCadEngine'
import {
  TOOL_GROUPS,
  TOOL_REGISTRY,
  lookupTool,
} from '../../sketch/tools/registry'
import { useToolPicks } from '../../hooks/useToolPicks'
import {
  useDesignTemplates,
  filterTemplatesByGeometry,
  type DesignTemplate,
} from '../../hooks/useDesignTemplates'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { GeometryKind } from '../../sketch/types'

interface Props {
  viewer: CesiumViewerType | null
  siteSlug?: string | null
}

/** Stock palette for the inline layer colour picker — same palette the
 *  engine cycles through on layer creation, plus a few extras. Keeps
 *  the picker compact (one row in a 320px pane). */
const LAYER_COLOURS = [
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#f87171',
  '#fb923c', '#facc15', '#34d399', '#94a3b8', '#ffffff',
]

/** Default tool to auto-activate per template geometry — keeps the
 *  chip click responsive without forcing the user to also pick a tool. */
const DEFAULT_TOOL_FOR_GEOMETRY: Record<'point' | 'line' | 'polygon', string> = {
  point: 'point',
  line: 'line',
  polygon: 'polygon',
}

export default function SketchTab({ viewer, siteSlug = null }: Props) {
  const activeToolId = useCadEngine(s => s.activeToolId)
  const setActiveTool = useCadEngine(s => s.setActiveTool)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)
  const activeTemplateId = useCadEngine(s => s.activeTemplateId)
  const setActiveTemplate = useCadEngine(s => s.setActiveTemplate)
  const sketches = useCadEngine(s => s.sketches)
  const createSketch = useCadEngine(s => s.createSketch)
  const setLayerColour = useCadEngine(s => s.setLayerColour)
  const setLayerLineWidth = useCadEngine(s => s.setLayerLineWidth)
  const clearSketchNodes = useCadEngine(s => s.clearSketchNodes)

  const { templates } = useDesignTemplates(siteSlug)

  // Hook that handles globe clicks while a tool is active. Streams
  // positions into the draft node + commits when clicksToFinish is met.
  useToolPicks({ viewer })

  // Auto-bootstrap a sketch the first time the Sketch tab mounts with
  // no active sketch. Without this, users land on a placeholder ("Pick
  // or create a sketch first") and have to jump to Layers to get going
  // — which is exactly the "missing sketches setup" complaint.
  useEffect(() => {
    if (!siteSlug) return
    if (activeSketchId) return
    if (Object.keys(sketches).length > 0) return
    // Bootstrap a CAD sketch (kind defaults to 'cad'); the
    // LayersTab applies the materials preset on user-driven
    // creation, but this is a one-shot fallback so a fresh sketch
    // exists when the user clicks straight into the Sketch tab.
    createSketch({ name: 'Sketch 1', siteId: siteSlug, kind: 'cad' })
  }, [activeSketchId, sketches, createSketch, siteSlug])

  const activeTool = lookupTool(activeToolId)
  const activeToolGeometry: GeometryKind | null = activeTool?.geometryType ?? null

  const visibleTemplates = useMemo(
    () => filterTemplatesByGeometry(templates, activeToolGeometry),
    [templates, activeToolGeometry],
  )

  if (!activeSketchId) {
    // First mount before the bootstrap effect lands — render an
    // empty-state spinner-stand-in rather than the old hard placeholder
    // so the tab looks alive while the engine settles.
    return (
      <div className="sketch-tab__empty">
        <p>Preparing your sketch…</p>
      </div>
    )
  }

  const canDraw = !!activeLayerId

  const activeSketch = sketches[activeSketchId]
  const activeLayer = activeSketch?.layers.find(l => l.id === activeLayerId) ?? null

  function pickTool(id: string) {
    if (!canDraw) return
    const next = activeToolId === id ? null : id
    setActiveTool(next)
  }

  function pickTemplate(t: DesignTemplate) {
    if (!canDraw) return
    if (activeTemplateId === t.id) {
      setActiveTemplate(null)
      return
    }
    setActiveTemplate(t.id)
    // Auto-activate the matching tool unless one is already active
    // (and compatible with the template geometry).
    const compat = activeTool
      && (!t.geometry || activeTool.geometryType === t.geometry)
    if (!compat && t.geometry) {
      const fallback = DEFAULT_TOOL_FOR_GEOMETRY[t.geometry]
      if (fallback && fallback in TOOL_REGISTRY) {
        setActiveTool(fallback)
      }
    }
  }

  return (
    <div className="sketch-tab">
      {!canDraw && (
        <div className="dl-warning" style={{ marginBottom: 12 }}>
          Pick a layer in the Layers tab to start drawing.
        </div>
      )}

      {activeSketch && activeLayer && (
        <div className="sketch-tab__group">
          <div className="sketch-tab__group-label">Style</div>
          <div className="sketch-style-row">
            <span className="sketch-style-row__hint">Layer colour</span>
            <div className="sketch-style-swatches">
              {LAYER_COLOURS.map(c => {
                const on = activeLayer.colour?.toLowerCase() === c.toLowerCase()
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set layer colour ${c}`}
                    aria-pressed={on}
                    className={`sketch-style-swatch${on ? ' is-on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setLayerColour(activeSketch.id, activeLayer.id, c)}
                  />
                )
              })}
            </div>
            <div className="sketch-style-row__lw">
              <span className="sketch-style-row__hint">
                Line weight · {activeLayer.lineWidth ?? 3}px
              </span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={activeLayer.lineWidth ?? 3}
                onChange={e => setLayerLineWidth(activeSketch.id, activeLayer.id, Number(e.target.value))}
                aria-label="Layer line weight"
                style={{ width: '100%' }}
              />
            </div>
            <button
              type="button"
              className="sketch-style-row__clear"
              onClick={() => {
                if (!confirm(`Clear all features from "${activeSketch.name}"? This can be undone.`)) return
                clearSketchNodes(activeSketch.id)
              }}
              title="Remove every feature in this sketch (undoable)"
            >
              Clear sketch
            </button>
          </div>
        </div>
      )}

      {visibleTemplates.length > 0 && (
        <div className="sketch-tab__group">
          <div className="sketch-tab__group-label">Templates</div>
          <div className="sketch-tpl-chips">
            {visibleTemplates.map(t => {
              const active = activeTemplateId === t.id
              const swatch = t.colour ?? '#22d3ee'
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`sketch-tpl-chip${active ? ' active' : ''}`}
                  onClick={() => pickTemplate(t)}
                  disabled={!canDraw}
                  title={t.geometry ? `${t.name} · ${t.geometry}` : t.name}
                >
                  <span className="sketch-tpl-chip-dot" style={{ background: swatch }} />
                  <span className="sketch-tpl-chip-label">{t.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {TOOL_GROUPS.map(group => (
        <div key={group.id} className="sketch-tab__group">
          <div className="sketch-tab__group-label">{group.label}</div>
          <div className="draw-tools-grid">
            {group.tools.map(toolId => {
              const tool = TOOL_REGISTRY[toolId]
              if (!tool) return null
              const active = activeToolId === toolId
              return (
                <button
                  key={toolId}
                  type="button"
                  className={`draw-tool-btn${active ? ' active' : ''}`}
                  onClick={() => pickTool(toolId)}
                  disabled={!canDraw}
                  title={tool.label + (tool.shortcut ? ` (${tool.shortcut})` : '')}
                >
                  <span className="draw-tool-icon">{tool.icon}</span>
                  <span className="draw-tool-label">{tool.label}</span>
                  {tool.shortcut && <kbd className="draw-tool-shortcut">{tool.shortcut}</kbd>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {!activeToolId && canDraw && (
        <p className="draw-hint">Pick a tool to begin. Press ESC to cancel any time.</p>
      )}
      {/* PlaceModeBar lives in the shell — rendered above the panel
          body so it overlays correctly when activeToolId is set. */}
    </div>
  )
}
