/**
 * Voxel SVO core types.
 *
 *   • Block       — single cell at some level. Indexed in an integer
 *                   ENU grid anchored at the layer's datum.
 *   • SVOChunk    — group of CHUNK_SIZE^3 blocks at a fixed level.
 *                   Chunks are sparse: only chunks that contain at
 *                   least one non-air block are kept in memory.
 *   • SVOLayer    — a named, persistable scope (site or sketch). The
 *                   datum nails a WGS84 point that anchors the ENU
 *                   integer grid; generators are the recipe that
 *                   re-evaluates to blocks on load.
 *   • SVOState    — the engine state held by useSvoEngine.
 *
 * Level mechanics: BASE_BLOCK_SIZE is the level-0 edge length
 * (12.5 cm). Level N edge length = BASE_BLOCK_SIZE * 2^N. Spec calls
 * for levels 0..10 → 12.5 cm to 128 m. Splitting a level-N block
 * yields 8 level-(N-1) children with indices (2i+δi, 2j+δj, 2k+δk).
 */

/** Edge length of a level-0 block in metres. */
export const BASE_BLOCK_SIZE = 0.125

/** Number of blocks per axis in an SVOChunk. A chunk holds
 *  CHUNK_SIZE^3 = 4096 cells maximum. */
export const CHUNK_SIZE = 16

export type BlockType =
  | 'air'
  | 'terrain'
  | 'rock'
  | 'ore'
  | 'overburden'
  | 'fill'
  | 'concrete'
  | 'steel'
  | 'water'
  | 'topsoil'
  | 'custom'

/** IFC class tagged onto each block when exporting to IFC. Air is the
 *  empty string — air cells are never emitted. */
export const IFC_CLASS: Record<BlockType, string> = {
  air: '',
  terrain: 'IfcGeographicElement',
  rock: 'IfcGeographicElement',
  ore: 'IfcGeographicElement',
  overburden: 'IfcGeographicElement',
  fill: 'IfcGeographicElement',
  concrete: 'IfcWall',
  steel: 'IfcBeam',
  water: 'IfcSpace',
  topsoil: 'IfcGeographicElement',
  custom: 'IfcBuildingElement',
}

export type BlockFace = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west'

export interface Block {
  /** Integer ENU grid index — east axis. */
  i: number
  /** Integer ENU grid index — north axis. */
  j: number
  /** Integer ENU grid index — up axis. */
  k: number
  /** Octree level. 0 = 12.5 cm; each step doubles the edge length. */
  level: number
  type: BlockType
  /** Optional reference to a saved material preset. */
  materialPreset?: string
  /** Optional per-face texture overrides (preset id per face). */
  faceTextures?: Partial<Record<BlockFace, string>>
  /** Free-form attributes — surfaces in IFC export and the inspector. */
  attrs?: Record<string, unknown>
}

export interface SVOChunk {
  /** Chunk grid coordinates — ci = floor(i / CHUNK_SIZE). */
  ci: number
  cj: number
  ck: number
  level: number
  /** Sparse map of cells: blockKey(i,j,k) → Block. Only non-air cells
   *  are stored; an absent key means the cell is air. */
  blocks: Map<string, Block>
  /** Persistence flag — set on any block edit, cleared by saveLayer. */
  dirty: boolean
  /** Renderer flag — set on any block edit, cleared by the mesher. */
  meshDirty: boolean
}

export type SVOGeneratorType =
  | 'box_fill'
  | 'pyramid'
  | 'prism'
  | 'wedge'
  | 'dome'
  | 'terrain_mask'
  | 'water_fill'

/** Procedural recipe — re-evaluates to a deterministic Block[] on
 *  load. Stored alongside the block snapshot so the layer can be
 *  re-baked at any level. */
export interface SVOGenerator {
  id: string
  type: SVOGeneratorType
  /** Type-specific parameters. See svoOps.evaluateGenerator for
   *  the per-type schema. */
  params: Record<string, unknown>
  /** Block type emitted by this generator. */
  materialType: BlockType
  /** Octree level at which to emit. */
  level: number
}

/** A WGS84 point in lon/lat/alt that nails the ENU grid origin. */
export interface SVODatum {
  lon: number
  lat: number
  alt: number
}

export interface SVOLayer {
  id: string
  name: string
  /** Site this layer belongs to — drives the persistence URL. */
  siteSlug: string
  /** Site-level layers persist with the site; sketch-level layers
   *  travel with a single sketch. */
  scope: 'site' | 'sketch'
  /** ENU origin in WGS84. */
  datum: SVODatum
  generators: SVOGenerator[]
}

export type SVORenderMode = 'solid' | 'textured' | 'raytrace'

/** Alias kept for the renderer module which was authored before the
 *  engine landed and uses the unprefixed name. */
export type RenderMode = SVORenderMode

/** Edge length of a level-N block in metres. Mirror of
 *  `enuMath.blockSizeAtLevel` — kept here so the renderer can
 *  compute mesh extents without importing the Cesium-bound
 *  enuMath module (the renderer's own Cesium imports already drag
 *  in the runtime). Both names resolve to the same value. */
export function blockEdgeMeters(level: number): number {
  return BASE_BLOCK_SIZE * Math.pow(2, level)
}

export interface SVOState {
  layers: SVOLayer[]
  activeLayerId: string | null
  /** Octree level used when stamping new blocks via the editor. */
  activeLevel: number
  renderMode: SVORenderMode
  /** All currently-loaded chunks across all layers, keyed by
   *  chunkKey(ci,cj,ck,level,layerId). */
  chunks: Map<string, SVOChunk>
}

/** Wire format for `.esv`. JSON; the transport may gzip. */
export interface ESVFile {
  version: 1
  datum: SVODatum
  baseLevelSize: number
  generators: SVOGenerator[]
  blocks: Array<{
    i: number
    j: number
    k: number
    level: number
    type: BlockType
    materialPreset?: string
    faceTextures?: Partial<Record<BlockFace, string>>
    attrs?: Record<string, unknown>
  }>
}
