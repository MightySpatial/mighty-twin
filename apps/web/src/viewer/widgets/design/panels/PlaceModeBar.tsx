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
 * The draft node lifecycle: useToolPicks stamps a fresh node into the
 * engine when a tool activates and writes the id into
 * `state.activeDraftNodeId`. The bar reads that id so its Parameters
 * + Vertex + Attributes sections all bind to the same node. Finishing
 * (button or auto-commit) clears `activeToolId`; useToolPicks tears
 * down + leaves the draft as a permanent node (or removes it if no
 * positions were captured).
 *
 * Auto-scroll: when SECTIONS 1 (parameters) or 4 (vertices) appear —
 * either because the tool requires them or because the first pick
 * just landed — we run `nextTick + scrollIntoView({behavior:'smooth'})`
 * so the user doesn't have to scroll manually to find the new
 * controls. v1 calls this the "op-param / pick-second" auto-scroll.
 *
 * Spec V1_SPEC.md §5 + §6.
 */
import { Suspense, useEffect, useRef } from 'react'
import { useCadEngine } from '../sketch/useCadEngine'
import { lookupTool, SECTIONS } from '../sketch/tools/registry'
import AttributesEditor from '../primitives/AttributesEditor'
import VertexListEditor from '../primitives/VertexListEditor'
import SectionLabel from '../primitives/SectionLabel'

type ElevationMode = 'none' | 'terrain' | 'object' | 'entry'

const ELEV_MODE_OPTIONS: { value: ElevationMode; label: string; desc: string }[] = [
  { value: 'none',    label: 'None (clamp to globe)', desc: 'Place vertices at the picked surface point.' },
  { value: 'terrain', label: 'Snap to terrain',       desc: 'Override altitude with the terrain height under each vertex.' },
  { value: 'object',  label: 'Snap to objects',       desc: 'Pick the nearest visible object (3D tile / model / mesh).' },
  { value: 'entry',   label: 'Manual entry',          desc: 'Use the offset value below as the absolute altitude.' },
]

interface Props {
  /** Site slug — passed through to the AttributesEditor so it can fetch
   *  + save templates. Optional; when null the template picker hides. */
  siteSlug?: string | null
}

export default function PlaceModeBar({ siteSlug = null }: Props) {
  const activeToolId = useCadEngine(s => s.activeToolId)
  const setActiveTool = useCadEngine(s => s.setActiveTool)
  const draftNodeId = useCadEngine(s => s.activeDraftNodeId)
  const draft = useCadEngine(s => (draftNodeId ? s.nodes[draftNodeId] : null))
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)
  const removeNode = useCadEngine(s => s.removeNode)
  const tool = lookupTool(activeToolId)

  // Auto-scroll target — Section 4 (vertices) is the most useful one
  // to surface as soon as the user starts clicking. v1 also scrolls
  // when SECTIONS.PARAMETERS becomes available (tool just changed).
  const verticesRef = useRef<HTMLDivElement | null>(null)
  const paramsRef = useRef<HTMLDivElement | null>(null)
  const positionsLen = draft?.params.positions?.length ?? 0
  const lastScrolledLen = useRef<number>(0)

  // Scroll the parameters section into view on tool change.
  useEffect(() => {
    if (!tool?.parameters) return
    queueMicrotask(() => {
      paramsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    // Reset the vertices-scroll watermark when the tool changes — a
    // fresh draft starts at 0 picks again.
    lastScrolledLen.current = 0
  }, [tool?.id, tool?.parameters])

  // Scroll the vertices section into view on the second pick (the
  // moment the polyline-style tools start showing real geometry).
  useEffect(() => {
    if (!tool || !tool.flags.usesDraftVertices) return
    if (positionsLen >= 2 && lastScrolledLen.current < 2) {
      lastScrolledLen.current = positionsLen
      queueMicrotask(() => {
        verticesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [positionsLen, tool])

  if (!tool) return null

  const showElev = !tool.flags.skipElev
  const showAttributes = tool.flags.usesGenericAttributes || tool.flags.usesPipeAttributes
  const showVertices = tool.flags.usesDraftVertices

  const elevMode = ((draft?.params.elevMode as ElevationMode | undefined) ?? 'none')
  const elevOffset = (typeof draft?.params.anchorAlt === 'number' ? draft.params.anchorAlt : 0)
  const elevDesc = ELEV_MODE_OPTIONS.find(o => o.value === elevMode)?.desc ?? ''

  function cancel() {
    // Cancel both: if there's a draft with no picks, useToolPicks's
    // teardown removes it; if it has picks the user keeps the partial
    // node. Hard-cancel via the trash icon (next to ×) drops it
    // unconditionally — handled by the dedicated handler below.
    setActiveTool(null)
  }

  function discardDraft() {
    if (draftNodeId) removeNode(draftNodeId)
    setActiveTool(null)
  }

  return (
    <div className="place-mode-bar">
      {/* Section 0: chrome */}
      <div className="place-mode-bar__chrome">
        <span className="place-mode-bar__icon">{tool.icon}</span>
        <strong className="place-mode-bar__name">{tool.label}</strong>
        {showVertices && positionsLen > 0 && (
          <span className="draw-vertex-count">{positionsLen} pt{positionsLen === 1 ? '' : 's'}</span>
        )}
        {draftNodeId && (
          <button
            type="button"
            className="place-mode-bar__cancel"
            title="Discard draft"
            onClick={discardDraft}
            aria-label="Discard draft"
          >🗑</button>
        )}
        <button
          type="button"
          className="place-mode-bar__cancel"
          title="Cancel (ESC)"
          onClick={cancel}
        >×</button>
      </div>

      {/* Section 1: tool-specific parameters */}
      {tool.parameters && draftNodeId && (
        <div ref={paramsRef} data-section={SECTIONS.PARAMETERS} className="place-mode-bar__section">
          <Suspense fallback={<div className="place-mode-bar__loading">Loading…</div>}>
            {(() => {
              const Params = tool.parameters
              return <Params draftNodeId={draftNodeId} />
            })()}
          </Suspense>
        </div>
      )}

      {/* Section 2: elevation mode + manual offset */}
      {showElev && draftNodeId && (
        <div data-section={SECTIONS.ELEV} className="place-mode-bar__section draw-elevation-section">
          <SectionLabel>Elevation</SectionLabel>
          <select
            className="draw-elevation-select"
            value={elevMode}
            onChange={e => updateNodeParam(draftNodeId, { elevMode: e.target.value as ElevationMode })}
            aria-label="Elevation mode"
          >
            {ELEV_MODE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {elevMode === 'entry' && (
            <div className="draw-offset-row">
              <input
                type="number"
                className="draw-offset-input"
                value={elevOffset}
                step={0.1}
                onChange={e => updateNodeParam(draftNodeId, { anchorAlt: Number(e.target.value) })}
                aria-label="Manual altitude (m)"
              />
              <span className="dw-number-unit">m</span>
            </div>
          )}
          <p className="draw-elevation-desc">{elevDesc}</p>
        </div>
      )}

      {/* Section 3: attributes */}
      {showAttributes && draftNodeId && (
        <div data-section={SECTIONS.ATTRIBUTES} className="place-mode-bar__section">
          <SectionLabel>Attributes</SectionLabel>
          <AttributesEditor
            nodeId={draftNodeId}
            siteSlug={siteSlug}
            geometry={tool.geometryType}
          />
        </div>
      )}

      {/* Section 4: vertices */}
      {showVertices && draftNodeId && (
        <div ref={verticesRef} data-section={SECTIONS.VERTICES} className="place-mode-bar__section">
          <SectionLabel>Vertices</SectionLabel>
          <VertexListEditor nodeId={draftNodeId} />
        </div>
      )}

      {/* Section 5: actions (finish button) */}
      {tool.finishLabel != null && (
        <div data-section={SECTIONS.ACTIONS} className="place-mode-bar__actions">
          <button
            type="button"
            className="move-apply-btn"
            onClick={() => setActiveTool(null)}
            disabled={showVertices && positionsLen === 0}
          >
            {tool.finishLabel}
          </button>
        </div>
      )}
    </div>
  )
}
