/**
 * ToolRegistry — port of v1 ``src/components/design-widget/sections/ToolRegistry.js``.
 *
 * Single source of truth describing each tool's layout, click behaviour,
 * and the Parameters component the place-mode bar renders. The shell
 * looks up the active tool's record and renders SECTIONS 0–5 in
 * declarative order:
 *
 *   0 CHROME      placing icon, tool name, layer chip, cancel/delete
 *   1 PARAMETERS  tool-specific Parameters component (or null)
 *   2 ELEV        elevation/height controls (skipped if skipElev)
 *   3 ATTRIBUTES  AttributesEditor — generic or pipe canonical
 *   4 VERTICES    VertexListEditor (skipped if !usesDraftVertices)
 *   5 ACTIONS     finish button (or auto-commit when finishLabel === null)
 *
 * Spec V1_SPEC.md §5 + §6.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GeometryKind } from '../types'

export interface ToolFlags {
  /** Hide the elevation section. Auto-place tools (ellipse, rectangle)
   *  derive elevation from the click — no separate input required. */
  skipElev: boolean
  /** Render the canonical pipe attribute editor (Size / Material / …)
   *  instead of the generic schema-driven one. */
  usesPipeAttributes: boolean
  /** Hide the generic AttributesEditor entirely. Op tools (extrude /
   *  loft / wire_cut / make_hole) inherit attributes from their inputs. */
  usesGenericAttributes: boolean
  /** Show the VertexListEditor (skip for auto-place + table-driven
   *  tools that build positions from their own UI). */
  usesDraftVertices: boolean
  /** Drag-sample mode — useToolPicks listens for pointerdown/move/up
   *  instead of LEFT_CLICK and appends a globe-picked position per
   *  throttled move sample. Used by Pen (freehand) and Eraser (drag
   *  to wipe). The geometry committed is whatever positions list
   *  the user drew. */
  dragSampled?: boolean
  /** Eraser mode — useToolPicks treats each picked feature as a
   *  delete target instead of writing into a draft node. */
  eraser?: boolean
}

export const DEFAULT_FLAGS: ToolFlags = {
  skipElev: false,
  usesPipeAttributes: false,
  usesGenericAttributes: true,
  usesDraftVertices: true,
}

export interface ParametersComponentProps {
  /** Stable id of the in-progress draft node — the component reads/writes
   *  draft state via the engine. */
  draftNodeId: string
}

export interface ToolSpec {
  /** Stable id used by the registry + engine. */
  id: string
  /** Human-readable label for the rail / place-mode-bar header. */
  label: string
  /** Geometry kind the tool emits. Drives the registry-aware filters
   *  for attribute templates ("only show point templates for point
   *  tools"). */
  geometryType: GeometryKind
  /** Click count required before auto-commit. 0 = table-driven (no
   *  globe clicks). null = manual finish via the ACTIONS section's
   *  finish button. */
  clicksToFinish: number | null
  /** Lazy-loaded Parameters component (null = no per-tool params). */
  parameters: LazyExoticComponent<ComponentType<ParametersComponentProps>> | null
  /** Section flags. */
  flags: ToolFlags
  /** ACTIONS section button label. null = auto-commit (no button). */
  finishLabel: string | null
  /** Single-character glyph for the tool tile. */
  icon: string
  /** Optional keyboard shortcut hint shown in the tile. */
  shortcut?: string
}

export const SECTIONS = {
  CHROME: 0,
  PARAMETERS: 1,
  ELEV: 2,
  ATTRIBUTES: 3,
  VERTICES: 4,
  ACTIONS: 5,
} as const

// ── Lazy parameter component imports ────────────────────────────────────
//
// One import per tool, lazy-loaded so the parameter-heavy tools don't
// land in the initial chunk. Components live next door in ./parameters/.

const CurveParameters     = lazy(() => import('./parameters/CurveParameters'))
const EllipseParameters   = lazy(() => import('./parameters/EllipseParameters'))
const RectangleParameters = lazy(() => import('./parameters/RectangleParameters'))
const PolygonNParameters  = lazy(() => import('./parameters/PolygonNParameters'))
const PipeParameters      = lazy(() => import('./parameters/PipeParameters'))
const TraverseParameters  = lazy(() => import('./parameters/TraverseParameters'))
const PtLineParameters    = lazy(() => import('./parameters/PtLineParameters'))
const PtCircleParameters  = lazy(() => import('./parameters/PtCircleParameters'))
const PtCylinderParameters = lazy(() => import('./parameters/PtCylinderParameters'))
const PtSphereParameters  = lazy(() => import('./parameters/PtSphereParameters'))
const PtConeParameters    = lazy(() => import('./parameters/PtConeParameters'))
const PtBoxParameters     = lazy(() => import('./parameters/PtBoxParameters'))
const PtPitParameters     = lazy(() => import('./parameters/PtPitParameters'))
const ExtrudeParameters   = lazy(() => import('./parameters/ExtrudeParameters'))
const LoftParameters      = lazy(() => import('./parameters/LoftParameters'))

// ── Registry table ──────────────────────────────────────────────────────

export const TOOL_REGISTRY: Record<string, ToolSpec> = {
  freehand: {
    id: 'freehand', label: 'Pen', geometryType: 'line',
    clicksToFinish: null, parameters: null,
    flags: { ...DEFAULT_FLAGS, dragSampled: true, usesDraftVertices: false },
    finishLabel: null, icon: '✎', shortcut: 'B',
  },
  point: {
    id: 'point', label: 'Point', geometryType: 'point',
    clicksToFinish: 1, parameters: null, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '●', shortcut: 'P',
  },
  eraser: {
    id: 'eraser', label: 'Eraser', geometryType: 'point',
    clicksToFinish: null, parameters: null,
    flags: { ...DEFAULT_FLAGS, eraser: true, usesGenericAttributes: false, usesDraftVertices: false },
    finishLabel: null, icon: '⌫', shortcut: 'E',
  },
  line: {
    id: 'line', label: 'Line', geometryType: 'line',
    clicksToFinish: null, parameters: null, flags: DEFAULT_FLAGS,
    finishLabel: 'Finish', icon: '╱', shortcut: 'L',
  },
  polygon: {
    id: 'polygon', label: 'Polygon', geometryType: 'polygon',
    clicksToFinish: null, parameters: null, flags: DEFAULT_FLAGS,
    finishLabel: 'Close', icon: '⬡', shortcut: 'G',
  },
  curve: {
    id: 'curve', label: 'Curve', geometryType: 'line',
    clicksToFinish: null, parameters: CurveParameters, flags: DEFAULT_FLAGS,
    finishLabel: 'Finish', icon: '∿',
  },
  ellipse: {
    id: 'ellipse', label: 'Ellipse', geometryType: 'polygon',
    clicksToFinish: 3, parameters: EllipseParameters,
    flags: { ...DEFAULT_FLAGS, skipElev: true },
    finishLabel: null, icon: '◯',
  },
  rectangle: {
    id: 'rectangle', label: 'Rectangle', geometryType: 'polygon',
    clicksToFinish: 2, parameters: RectangleParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '▭', shortcut: 'R',
  },
  polygon_n: {
    id: 'polygon_n', label: 'N-gon', geometryType: 'polygon',
    clicksToFinish: 2, parameters: PolygonNParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '⬢',
  },
  pipe_draw: {
    id: 'pipe_draw', label: 'Pipe', geometryType: 'line',
    clicksToFinish: null, parameters: PipeParameters,
    flags: { ...DEFAULT_FLAGS, usesPipeAttributes: true, usesGenericAttributes: false },
    finishLabel: 'Finish', icon: '⏤',
  },
  traverse: {
    id: 'traverse', label: 'Traverse', geometryType: 'line',
    clicksToFinish: 0, parameters: TraverseParameters,
    flags: { ...DEFAULT_FLAGS, usesDraftVertices: false },
    finishLabel: 'Commit', icon: '⟁',
  },
  pt_line: {
    id: 'pt_line', label: 'Pt Line', geometryType: 'point',
    clicksToFinish: 1, parameters: PtLineParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '↗',
  },
  pt_circle: {
    id: 'pt_circle', label: 'Pt Circle', geometryType: 'point',
    clicksToFinish: 1, parameters: PtCircleParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '◎',
  },
  pt_cylinder: {
    id: 'pt_cylinder', label: 'Cylinder', geometryType: 'point',
    clicksToFinish: 1, parameters: PtCylinderParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '⊙', shortcut: 'C',
  },
  pt_sphere: {
    id: 'pt_sphere', label: 'Sphere', geometryType: 'point',
    clicksToFinish: 1, parameters: PtSphereParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '●',
  },
  pt_cone: {
    id: 'pt_cone', label: 'Cone', geometryType: 'point',
    clicksToFinish: 1, parameters: PtConeParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '▲',
  },
  pt_box: {
    id: 'pt_box', label: 'Box', geometryType: 'point',
    clicksToFinish: 1, parameters: PtBoxParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '⬛',
  },
  pt_pit: {
    id: 'pt_pit', label: 'Pit', geometryType: 'point',
    clicksToFinish: 1, parameters: PtPitParameters, flags: DEFAULT_FLAGS,
    finishLabel: null, icon: '⬇',
  },
  extrude: {
    id: 'extrude', label: 'Extrude', geometryType: 'polygon',
    clicksToFinish: 0, parameters: ExtrudeParameters,
    flags: { ...DEFAULT_FLAGS, usesGenericAttributes: false, usesDraftVertices: false },
    finishLabel: 'Apply', icon: '⇧',
  },
  loft: {
    id: 'loft', label: 'Loft', geometryType: 'polygon',
    clicksToFinish: 0, parameters: LoftParameters,
    flags: { ...DEFAULT_FLAGS, usesGenericAttributes: false, usesDraftVertices: false },
    finishLabel: 'Apply', icon: '⌒',
  },
  wire_cut: {
    id: 'wire_cut', label: 'Wire cut', geometryType: 'line',
    clicksToFinish: null, parameters: null,
    flags: { ...DEFAULT_FLAGS, usesGenericAttributes: false },
    finishLabel: 'Cut', icon: '✂',
  },
  make_hole: {
    id: 'make_hole', label: 'Hole', geometryType: 'polygon',
    clicksToFinish: null, parameters: null,
    flags: { ...DEFAULT_FLAGS, usesGenericAttributes: false },
    finishLabel: 'Subtract', icon: '◌',
  },
}

/** Convenience lookup. Returns null when the id isn't a known tool. */
export function lookupTool(id: string | null): ToolSpec | null {
  if (!id) return null
  return TOOL_REGISTRY[id] ?? null
}

/** All tool ids, in registry-defined order. The shell renders the
 *  Create grid from this list. */
export const TOOL_ORDER: string[] = [
  'point', 'line', 'polygon', 'rectangle', 'circle' /* alias */, 'curve',
  'ellipse', 'polygon_n', 'pipe_draw', 'traverse',
  'pt_line', 'pt_circle', 'pt_cylinder', 'pt_sphere', 'pt_cone',
  'pt_box', 'pt_pit',
  'extrude', 'loft', 'wire_cut', 'make_hole',
].filter(id => id in TOOL_REGISTRY)

/** Tools grouped by section for the SketchTab grid. */
export const TOOL_GROUPS: { id: string; label: string; tools: string[] }[] = [
  {
    id: 'sketch-draw',
    label: 'Draw',
    tools: ['freehand', 'point', 'line', 'polygon', 'rectangle', 'ellipse', 'eraser'],
  },
  {
    id: 'create-flat',
    label: 'More shapes',
    tools: ['curve', 'polygon_n', 'traverse'],
  },
  {
    id: 'create-pipes',
    label: 'Pipes & lines',
    tools: ['pipe_draw', 'pt_line'],
  },
  {
    id: 'create-points',
    label: 'Point primitives',
    tools: ['pt_circle', 'pt_cylinder', 'pt_sphere', 'pt_cone', 'pt_box', 'pt_pit'],
  },
  {
    id: 'modify',
    label: 'Modify',
    tools: ['extrude', 'loft', 'wire_cut', 'make_hole'],
  },
]
