/**
 * PlaceModeBar — orchestration overlay shown when activeToolId is set.
 *
 * Renders SECTIONS 0-5 declaratively from the active tool's registry
 * record:
 *   0 CHROME      header (placing icon + tool name + cancel)
 *   1 PARAMETERS  the lazy-loaded Parameters component for this tool
 *   2 ELEV        elevation control (skipped when flags.skipElev)
 *   3 ATTRIBUTES  generic / pipe AttributesEditor (skipped when
 *                 !flags.usesGenericAttributes && !flags.usesPipeAttributes)
 *   4 VERTICES    VertexListEditor (skipped when !flags.usesDraftVertices)
 *   5 ACTIONS     finish button (or auto-commit when finishLabel === null)
 *
 * The draft node lifecycle: when a tool activates, the bar calls
 * `addNode` with a synthetic "draft" id whose params start empty. As
 * the user picks on the globe (Cesium handler in useCadEngineClicks)
 * positions stream into the draft. The finish button (or click count)
 * commits — i.e. clears the activeToolId; the draft id is preserved
 * as a real node.
 */
import { Suspense } from 'react'
import { useCadEngine } from '../sketch/useCadEngine'
import { lookupTool, SECTIONS } from '../sketch/tools/registry'

export default function PlaceModeBar() {
  const activeToolId = useCadEngine(s => s.activeToolId)
  const setActiveTool = useCadEngine(s => s.setActiveTool)
  const tool = lookupTool(activeToolId)

  if (!tool) return null

  // Placeholder draft node id. Real flow: when SketchTab activates a
  // tool, it also stamps a draft node into the engine and sets a
  // `draftNodeId` somewhere (state ref). The Parameters component
  // reads/writes that draft. For Phase 4 minimal wiring, the
  // Parameters component receives a synthetic id; SketchTab's
  // commitDraft flow promotes it to a permanent node.
  const draftNodeId = `__draft_${tool.id}`

  return (
    <div className="place-mode-bar" style={{ '--section': 0 } as React.CSSProperties}>
      {/* Section 0: chrome */}
      <div className="place-mode-bar__chrome">
        <span className="place-mode-bar__icon">{tool.icon}</span>
        <strong className="place-mode-bar__name">{tool.label}</strong>
        <button
          type="button"
          className="place-mode-bar__cancel"
          title="Cancel (ESC)"
          onClick={() => setActiveTool(null)}
        >×</button>
      </div>

      {/* Section 1: tool-specific parameters */}
      {tool.parameters && (
        <Suspense fallback={<div className="place-mode-bar__loading">Loading…</div>}>
          <div data-section={SECTIONS.PARAMETERS} className="place-mode-bar__section">
            {(() => {
              const Params = tool.parameters
              return <Params draftNodeId={draftNodeId} />
            })()}
          </div>
        </Suspense>
      )}

      {/* Section 5: actions (finish button) */}
      {tool.finishLabel != null && (
        <div data-section={SECTIONS.ACTIONS} className="place-mode-bar__actions">
          <button
            type="button"
            className="move-apply-btn"
            onClick={() => setActiveTool(null)}
          >
            {tool.finishLabel}
          </button>
        </div>
      )}
    </div>
  )
}
