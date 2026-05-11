/**
 * Sketch DAG types — port of MightyDT v1's useCadEngine state shape.
 *
 * A sketch is a user-owned named container of CAD-like geometry nodes
 * (the "design DAG") + a schema. Each node represents either a primitive
 * shape (sketch with positions) or an operation that consumes other
 * nodes via `inputs[]` (extrude, pipe, loft, …). The engine evaluates
 * the DAG in topological order.
 *
 * Spec V1_SPEC.md §1.
 */

/** Geometry classification for a node's output. Sketch primitives carry
 *  their own positions; ops produce derived geometry from `inputs[]`. */
export type GeometryKind = 'point' | 'line' | 'polygon' | 'other'

/** Discriminator for the node's role in the DAG.
 *  - 'sketch': leaf primitive — its `params.positions` define the shape.
 *  - 'op': consumes other nodes via `inputs[]` (extrude / pipe / loft / …).
 *  - 'box' / 'pit' / 'cylinder' / 'string': v1 type-tagged variants kept
 *    for backwards-compatibility with the existing v2 SketchFeature
 *    geometry tags. */
export type NodeType =
  | 'sketch'
  | 'op'
  | 'extrude'
  | 'pipe'
  | 'box'
  | 'pit'
  | 'cylinder'
  | 'string'
  | 'loft'
  | 'building'
  | 'model'

export type Position = [number, number] | [number, number, number]

/** Per-node style. v1 'style' shape merged with v2 FeatureStyle so the
 *  Cesium reconciler can drive both. */
export interface NodeStyle {
  color?: string
  fillColor?: string
  opacity?: number
  fillOpacity?: number
  outlineColor?: string
  outlineWidth?: number
  lineWidth?: number
  lineDash?: 'solid' | 'dash' | 'dot' | 'dashdot'
  pointSize?: number
  pointShape?: 'circle' | 'square' | 'diamond' | 'triangle' | 'cross'
  labelField?: string | null
  labelSize?: number
  /** Optional symbology pointer for rich point markers. */
  pointSymbol?: import('../../../shared/pointSymbology').PointSymbolStyle
}

/** Per-node parameters. Free-form because each tool stamps its own shape;
 *  the registry-driven Parameters component knows what fields exist. */
export interface NodeParams {
  geometry?: GeometryKind
  positions?: Position[]
  sketchId?: string
  sketchLayer?: string
  // Solid params (box / pit / cylinder)
  width?: number
  depth?: number
  height?: number
  radius?: number
  heading?: number
  pitch?: number
  roll?: number
  refZ?: 'top' | 'center' | 'bot'
  wallThickness?: number
  floorThickness?: number
  shape?: 'square' | 'round'
  // Pipe-specific
  pipe_fields?: Record<string, unknown>
  // Op-specific (extrude / loft / …)
  magnitude?: number
  bothSides?: boolean
  dirX?: number
  dirY?: number
  dirZ?: number
  // String / closed-ring toggle
  closed?: boolean
  // Anchor altitude when terrain-snap is involved
  anchorAlt?: number
  // Free-form catch-all so tools can stamp tool-specific keys without
  // forcing this interface to grow.
  [key: string]: unknown
}

export interface SketchNode {
  id: string
  type: NodeType
  /** DAG dependencies. Ops list 0..N source-node ids; sketch primitives
   *  leave this empty. */
  inputs: string[]
  /** Optional attribute-template id — the picker stamps style + default
   *  attributes from a Postgres-backed (or S3-backed) template. */
  template_id: string | null
  params: NodeParams
  attributes: Record<string, unknown>
  style: NodeStyle
}

export interface SketchLayerSubSchemas {
  point?: { fields: SchemaField[] }
  line?: { fields: SchemaField[] }
  polygon?: { fields: SchemaField[] }
}

export interface SchemaField {
  id?: string | number
  key: string
  type: 'text' | 'number' | 'date' | 'select'
  defaultVal?: string
  /** v1 'auto' flag — auto-populated, hidden from the editor. */
  auto?: boolean
  role?: string
  uom?: string
  /** Enumerated options for `type === 'select'`. Stamped by built-in
   *  schema presets; the schema editor preserves the array but doesn't
   *  currently expose an option editor — users edit defaultVal as
   *  plain text and the AttributesEditor can drive a dropdown when
   *  options are present. */
  options?: string[]
}

export interface RedlineApprovalState {
  state: 'pending' | 'approved' | 'rejected'
  note?: string
  assignee?: string
}

export interface SketchLayerSpec {
  id: string
  name: string
  colour: string
  /** Default stroke width (pixels) for line + polygon outline + freehand
   *  strokes on this layer. New nodes inherit it via SketchTab's
   *  Style row; defaults to 3 when unset. */
  lineWidth?: number
  visible: boolean
  locked: boolean
  /** Per-layer overrides — collapse to sketch-level when undefined. */
  coordMode?: 'world' | 'local'
  localOrigin?: { lon: number; lat: number; alt: number }
  fields?: SchemaField[]
  /** Redline-only: per-geometry sublayer schemas. */
  subSchemas?: SketchLayerSubSchemas
  /** Tier-1 categorisation value (v1: e.g. 'DRAINAGE'). */
  presetValue?: string
  /** UI-only flag — admins set/clear; no backend enforcement. */
  approval?: RedlineApprovalState
  collapsed?: boolean
}

export interface RedlineMetadata {
  scope: 'layer' | 'site'
  targetLayerId: string
  sublayerField?: string
  /** Per-geometry table routing (v1 PostGIS table names). v2 uses one
   *  features table; the value is informational here — the promotion
   *  plan resolves the actual targets server-side. */
  tables?: { point?: string; line?: string; polygon?: string }
}

export interface ChangeSetEntry {
  sourceDataSourceId: string
  sourceFeatureId: string
  /** For modified entries — the local node carrying the new geometry. */
  sketchNodeId?: string
}

export interface ChangeSet {
  modified: ChangeSetEntry[]
  deleted: ChangeSetEntry[]
}

export interface Sketch {
  id: string
  name: string
  /** Site affinity — single or multi. Redlines are single-site. */
  siteIds: string[]
  layers: SketchLayerSpec[]
  activeLayerId: string
  coordMode: 'world' | 'local'
  coordCrs: string
  localOrigin: { lon: number; lat: number; alt: number }
  localRotation: number
  heightDatum: 'msl' | 'ahd' | 'ellipsoidal' | 'terrain'
  // Redline-only:
  targetDataSourceId?: string
  redline?: RedlineMetadata
  changeSet?: ChangeSet
  /** Sketch-level default schema — layers inherit when their own
   *  fields[] is unset. */
  fields: SchemaField[]
  /** Dirty flag bumped by the schema editor. */
  _schemaModified?: boolean
  /** Per-user-per-site default — at most one sketch in the gallery has
   *  this set; persistence loads the default sketch as the active one
   *  on next session. Toggled from the LayersTab settings popover. */
  isDefault?: boolean
}

/** Persisted shape on disk — what `/api/me/json-files/design-sketch-*.json`
 *  carries. Spec §1. */
export interface SketchDoc {
  version: 2
  siteId: string
  sketchId: string
  sketch: Sketch
  nodes: SketchNode[]
  savedAt: number
}

export interface SketchIndexEntry {
  id: string
  name: string
  nodeCount: number
  savedAt: number
}

export interface SketchIndexDoc {
  version: 2
  siteId: string
  activeSketchId: string | null
  sketches: SketchIndexEntry[]
}

/** Internal engine state. Sketches live keyed by id; nodes are flat
 *  across all sketches (each carries `params.sketchId`). */
export interface CadEngineState {
  /** Sketches by id. */
  sketches: Record<string, Sketch>
  /** All nodes across all sketches. */
  nodes: Record<string, SketchNode>
  /** Output ids in topological order — last write wins. */
  outputIds: string[]
  /** Per-sketch dirty flags — bumped on any mutation, cleared after S3 save. */
  dirtySketches: Set<string>
  /** Currently selected node (modify-props bar / Properties tab). */
  selectedNodeId: string | null
  /** Active sketch id — gallery picker drives this. */
  activeSketchId: string | null
  /** Active draw layer id within the active sketch. */
  activeLayerId: string | null
  /** Active tool — null when no draw is in progress. */
  activeToolId: string | null
  /** Currently in-progress draft node id. The pick handler stamps a
   *  draft into `nodes` when a tool activates and writes its id here so
   *  the PlaceModeBar's Parameters / VertexListEditor can read+write it
   *  via `updateNodeParam` / `updateNodePositions`. */
  activeDraftNodeId: string | null
  /** Selected attribute-template id — populates the AttributesEditor's
   *  default fields and is stamped onto the next committed draft. */
  activeTemplateId: string | null
  /** Live-history mode toggle. When false, the engine defers re-evaluation
   *  until an explicit rebuild() call. */
  liveHistoryEnabled: boolean
  /** Set of node ids that are stale (need re-evaluation when liveHistoryEnabled is off). */
  staleNodeIds: Set<string>
  /** Mount-restore guard — writes are no-ops until the initial S3 fetch lands. */
  _persistReady: boolean
  /** Undo / redo stacks. Each entry is a snapshot of (sketches, nodes, outputIds). */
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
}

export interface UndoEntry {
  sketches: Record<string, Sketch>
  nodes: Record<string, SketchNode>
  outputIds: string[]
}

/** Persistence I/O contract — implementation lives in `persistence.ts`,
 *  the store consumes it via injection so the engine stays testable. */
export interface PersistenceIO {
  /** Read JSON file from /api/me/json-files/{name}. Returns null on 404. */
  readJsonFile<T>(name: string): Promise<T | null>
  /** Write JSON file. */
  writeJsonFile(name: string, body: unknown): Promise<void>
  /** Delete JSON file. Best-effort — 404 is fine. */
  deleteJsonFile(name: string): Promise<void>
}
