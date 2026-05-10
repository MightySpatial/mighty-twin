/** Voxel / SVO types — shared by the renderer and (eventually) the
 *  authoring tools. The parallel SVO authoring task lands its own
 *  module; if it overrides this file the renderer should keep
 *  compiling so long as the type names + shapes match. */

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

export type BlockFace = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west'

/** A single voxel. `i,j,k` are integer cell coordinates within the
 *  chunk; `level` is the SVO subdivision level (0 = base, larger =
 *  bigger). `materialPreset` and `faceTextures` are optional hints
 *  consumed by the textured render mode (not implemented in v1). */
export interface Block {
  i: number
  j: number
  k: number
  level: number
  type: BlockType
  materialPreset?: string
  faceTextures?: Partial<Record<BlockFace, string>>
  attrs?: Record<string, unknown>
}

/** A chunk holds a sparse grid of blocks. Keys in `blocks` are encoded
 *  by the authoring tool (typically `${i}|${j}|${k}|${level}`) — the
 *  renderer treats keys as opaque and iterates `blocks.values()`. */
export interface SVOChunk {
  ci: number
  cj: number
  ck: number
  level: number
  blocks: Map<string, Block>
  /** Set when the chunk's *data* changed (block added/removed/edited). */
  dirty: boolean
  /** Set when the *mesh* needs regen (subset of dirty: a renderer-only
   *  flag the data layer flips after a mesh-affecting change). */
  meshDirty: boolean
}

/** A voxel layer scopes a set of chunks to a real-world anchor. Chunks
 *  are placed in the local east-north-up frame at the datum. */
export interface SVOLayer {
  id: string
  name: string
  datum: { lon: number; lat: number; alt: number }
  scope: 'site' | 'sketch'
}

/** Render mode toggle exposed by the VoxelRenderer. */
export type RenderMode = 'solid' | 'textured' | 'raytrace'

/** Default edge length (metres) of a level-0 voxel. A level-N voxel
 *  has edge `BASE_BLOCK_SIZE_M * 2 ** level`. The authoring tool will
 *  eventually own this constant; export it here so the renderer has
 *  a single source of truth in the meantime. */
export const BASE_BLOCK_SIZE_M = 1.0

export function blockEdgeMeters(level: number): number {
  return BASE_BLOCK_SIZE_M * Math.pow(2, level)
}
