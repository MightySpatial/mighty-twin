/** Voxel renderer — public surface. The design widget imports from
 *  this barrel; internal modules cross-import each other directly to
 *  keep tree-shaking honest. */

export {
  getMaterialColor,
  getBaseAlpha,
  isTransparent,
  type RGBA,
} from './materialAtlas'

export {
  greedyMesh,
  type FaceQuad,
  type GreedyMeshOutput,
  type QuadVertex,
} from './greedyMesh'

export {
  buildChunkMesh,
  datumEnuToFixedFrame,
  VOXEL_VERTEX_FORMAT,
  type ChunkMeshOutput,
} from './chunkMesh'

export { makeWaterAppearance, makeSolidAppearance } from './WaterShader'

export { ChunkPrimitive, type ChunkPrimitiveOptions } from './ChunkPrimitive'

export {
  VoxelRenderer,
  useVoxelRenderer,
  chunkKey,
  type VoxelRendererOptions,
  type VoxelRendererState,
} from './VoxelRenderer'
