/** Per-block face culling — given an SVOChunk, emit one quad for
 *  every exposed face. A face is exposed when its same-level neighbour
 *  is missing OR the neighbour is air; water faces are *always*
 *  emitted regardless of neighbour so the WaterShader gets every
 *  surface boundary it needs to absorb against.
 *
 *  Named greedyMesh.ts because the file slot is called that in the
 *  spec and downstream callers import from this path. The current
 *  implementation is per-face culling, not greedy rectangle merging
 *  across blocks — switching to true greedy is a fair-game follow-up
 *  but the per-face output already satisfies the renderer contract. */

import { blockEdgeMeters, type Block, type BlockFace, type SVOChunk } from '../types'
import { getBaseAlpha, getMaterialColor, isTransparent, type RGBA } from './materialAtlas'

export interface QuadVertex {
  x: number
  y: number
  z: number
}

export interface FaceQuad {
  /** Four ENU-frame vertices, CCW from the face-outside view so a
   *  default outward normal computes consistently. */
  vertices: [QuadVertex, QuadVertex, QuadVertex, QuadVertex]
  normal: { x: number; y: number; z: number }
  face: BlockFace
  materialType: Block['type']
  /** Per-face base colour from the material atlas, packed RGBA 0..1. */
  color: RGBA
  /** Water-only: count of water blocks immediately below this face's
   *  column (same i,j,level, k strictly less). 0 for everything else. */
  depth: number
  alpha: number
}

export interface GreedyMeshOutput {
  /** Opaque quads (terrain, rock, …). Drawn first so transparency
   *  sorts cleanly. */
  opaque: FaceQuad[]
  /** Transparent quads (water, custom translucent). */
  transparent: FaceQuad[]
}

/** Encode a `(i,j,k,level)` block-coord triple plus level into a
 *  string key. Used internally to index the per-chunk lookup map —
 *  independent of whatever encoding the authoring tool stores. */
function blockKey(i: number, j: number, k: number, level: number): string {
  return `${i}|${j}|${k}|${level}`
}

/** The six axis-aligned offsets, paired with the face name they
 *  reveal when stepping in that direction from a given block. The
 *  spec's face vocabulary is top/bottom/north/south/east/west — we
 *  use the ENU convention: +X=east, +Y=north, +Z=up. */
interface Neighbour {
  di: number
  dj: number
  dk: number
  face: BlockFace
  /** Outward normal in ENU. */
  normal: { x: number; y: number; z: number }
}

const NEIGHBOURS: Neighbour[] = [
  { di:  0, dj:  0, dk:  1, face: 'top',    normal: { x:  0, y:  0, z:  1 } },
  { di:  0, dj:  0, dk: -1, face: 'bottom', normal: { x:  0, y:  0, z: -1 } },
  { di:  1, dj:  0, dk:  0, face: 'east',   normal: { x:  1, y:  0, z:  0 } },
  { di: -1, dj:  0, dk:  0, face: 'west',   normal: { x: -1, y:  0, z:  0 } },
  { di:  0, dj:  1, dk:  0, face: 'north',  normal: { x:  0, y:  1, z:  0 } },
  { di:  0, dj: -1, dk:  0, face: 'south',  normal: { x:  0, y: -1, z:  0 } },
]

/** Given a block's `(i,j,k,level)` and a face, return the four ENU
 *  vertices of that face, ordered CCW from outside. The block sits
 *  with its low corner at `(i,j,k) * edge` so the world position
 *  matches the i/j/k indexing without any half-cell shift. */
function faceVertices(
  i: number,
  j: number,
  k: number,
  level: number,
  face: BlockFace,
): [QuadVertex, QuadVertex, QuadVertex, QuadVertex] {
  const e = blockEdgeMeters(level)
  const x0 = i * e
  const y0 = j * e
  const z0 = k * e
  const x1 = x0 + e
  const y1 = y0 + e
  const z1 = z0 + e

  // CCW winding when viewed from the face's outward side.
  switch (face) {
    case 'top':
      return [
        { x: x0, y: y0, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 },
      ]
    case 'bottom':
      return [
        { x: x0, y: y1, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x0, y: y0, z: z0 },
      ]
    case 'east':
      return [
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y0, z: z1 },
      ]
    case 'west':
      return [
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y0, z: z0 },
        { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z1 },
      ]
    case 'north':
      return [
        { x: x1, y: y1, z: z0 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y1, z: z1 },
        { x: x1, y: y1, z: z1 },
      ]
    case 'south':
      return [
        { x: x0, y: y0, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 },
        { x: x0, y: y0, z: z1 },
      ]
  }
}

/** Build a same-level lookup keyed by `(i,j,k,level)`. The chunk's
 *  own keys are opaque to us, so we re-key off the block fields. */
function buildLookup(chunk: SVOChunk): Map<string, Block> {
  const map = new Map<string, Block>()
  chunk.blocks.forEach((b) => {
    map.set(blockKey(b.i, b.j, b.k, b.level), b)
  })
  return map
}

/** Pre-compute, for every (i,j,level) column, the sorted set of k
 *  values that hold water. Used to look up per-face water column
 *  depth without rescanning the chunk for every face. */
function buildWaterColumns(chunk: SVOChunk): Map<string, number[]> {
  const cols = new Map<string, number[]>()
  chunk.blocks.forEach((b) => {
    if (b.type !== 'water') return
    const key = `${b.i}|${b.j}|${b.level}`
    const list = cols.get(key)
    if (list) list.push(b.k)
    else cols.set(key, [b.k])
  })
  // Sort each list ascending so depth lookups can binary-walk if we
  // ever care about cost — for now linear on small chunks is fine.
  cols.forEach((list) => list.sort((a, b) => a - b))
  return cols
}

/** Count water blocks strictly below `k` in the column (i,j,level). */
function waterColumnDepth(
  cols: Map<string, number[]>,
  i: number,
  j: number,
  level: number,
  k: number,
): number {
  const list = cols.get(`${i}|${j}|${level}`)
  if (!list) return 0
  let n = 0
  for (const ck of list) {
    if (ck < k) n += 1
    else break
  }
  return n
}

/** Greedy-mesh entry point. Iterates every block, emits one quad per
 *  exposed face. Water faces are emitted unconditionally (against
 *  same-level water neighbours too) so the surface, sides, and bottom
 *  all reach the WaterShader. */
export function greedyMesh(chunk: SVOChunk): GreedyMeshOutput {
  const lookup = buildLookup(chunk)
  const waterCols = buildWaterColumns(chunk)

  const opaque: FaceQuad[] = []
  const transparent: FaceQuad[] = []

  chunk.blocks.forEach((block) => {
    if (block.type === 'air') return
    const blockTransparent = isTransparent(block.type)

    for (const nb of NEIGHBOURS) {
      const ni = block.i + nb.di
      const nj = block.j + nb.dj
      const nk = block.k + nb.dk
      const neighbour = lookup.get(blockKey(ni, nj, nk, block.level))

      // Cull rule: a same-level *opaque* neighbour hides this face.
      // Air or out-of-chunk → exposed. A transparent neighbour also
      // exposes (we want to see through water → solid boundaries).
      // Water itself overrides: water faces always emit, even against
      // other water, so the shader can compute boundary alpha.
      if (block.type !== 'water') {
        if (neighbour && neighbour.type !== 'air' && !isTransparent(neighbour.type)) {
          continue
        }
      }

      const verts = faceVertices(block.i, block.j, block.k, block.level, nb.face)
      const color = getMaterialColor(block.type, nb.face)
      const baseAlpha = getBaseAlpha(block.type)
      const depth =
        block.type === 'water'
          ? waterColumnDepth(waterCols, block.i, block.j, block.level, block.k)
          : 0

      const quad: FaceQuad = {
        vertices: verts,
        normal: nb.normal,
        face: nb.face,
        materialType: block.type,
        color,
        depth,
        alpha: baseAlpha,
      }

      if (blockTransparent) transparent.push(quad)
      else opaque.push(quad)
    }
  })

  return { opaque, transparent }
}
