/**
 * SketchTab — tool grid + Cesium pick handler.
 *
 * Top: registry-driven grid of tools, grouped per TOOL_GROUPS.
 * Click a tile → setActiveTool(id) → PlaceModeBar mounts (in the shell)
 * → user clicks the globe → useToolPicks streams positions into the
 * draft node → tool spec's clicksToFinish governs auto-commit.
 *
 * Below the grid (when no tool active): "select a tool to begin" hint.
 */
import { useCadEngine } from '../../sketch/useCadEngine'
import { TOOL_GROUPS, TOOL_REGISTRY } from '../../sketch/tools/registry'
import { useToolPicks } from '../../hooks/useToolPicks'
import type { Viewer as CesiumViewerType } from 'cesium'

interface Props {
  viewer: CesiumViewerType | null
}

export default function SketchTab({ viewer }: Props) {
  const activeToolId = useCadEngine(s => s.activeToolId)
  const setActiveTool = useCadEngine(s => s.setActiveTool)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)

  // Hook that handles globe clicks while a tool is active. Streams
  // positions into the draft node + commits when clicksToFinish is met.
  useToolPicks({ viewer })

  if (!activeSketchId) {
    return (
      <div className="sketch-tab__empty">
        <p>Pick or create a sketch first.</p>
        <p style={{ fontSize: 12, color: 'var(--dw-text-3)' }}>Switch to the Layers tab.</p>
      </div>
    )
  }

  const canDraw = !!activeLayerId

  function pickTool(id: string) {
    if (!canDraw) return
    const next = activeToolId === id ? null : id
    setActiveTool(next)
  }

  return (
    <div className="sketch-tab">
      {!canDraw && (
        <div className="dl-warning" style={{ marginBottom: 12 }}>
          Pick a layer in the Layers tab to start drawing.
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
