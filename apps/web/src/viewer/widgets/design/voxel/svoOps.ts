/**
 * SVO operations — pure, immutable updates over `Map<string, SVOChunk>`.
 *
 * Each mutating function returns a *new* outer Map; the chunks it
 * actually edits are shallow-cloned (with their internal `blocks`
 * Maps cloned only when modified). Untouched chunks are referentially
 * identical, which keeps Zustand selectors cheap.
 *
 * Conventions:
 *   • Block coordinates (i,j,k) are integer indices in the layer's
 *     ENU grid at the given level.
 *   • Air cells are *absent* in chunk.blocks. `getBlock` returns
 *     `undefined` for air; `setBlock(type:'air')` removes the cell.
 *   • Chunks with zero blocks after a removal are dropped from the
 *     outer Map — keeps the in-memory footprint sparse.
 */
import {
  CHUNK_SIZE,
  type Block,
  type BlockFace,
  type BlockType,
  type SVOChunk,
  type SVODatum,
  type SVOGenerator,
} from './types'
import { blockAltitude, positionToChunkCoords } from './enuMath'

// ── Keys ────────────────────────────────────────────────────────────────

export function blockKey(i: number, j: number, k: number): string {
  return `${i},${j},${k}`
}

export function chunkKey(
  ci: number,
  cj: number,
  ck: number,
  level: number,
  layerId: string,
): string {
  return `${layerId}|L${level}|${ci},${cj},${ck}`
}

/** Inverse of blockKey — useful for tests / iteration over a chunk's
 *  cells when we already have a key string. */
export function parseBlockKey(key: string): [number, number, number] {
  const parts = key.split(',')
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

// ── Internal helpers ───────────────────────────────────────────────────

/** Look up the chunk that owns block (i,j,k,level) in this layer.
 *  Returns undefined if the chunk isn't loaded. */
function findChunk(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): SVOChunk | undefined {
  const { ci, cj, ck } = positionToChunkCoords(i, j, k)
  return chunks.get(chunkKey(ci, cj, ck, level, layerId))
}

/** Make a fresh empty chunk for the given coords. */
function emptyChunk(ci: number, cj: number, ck: number, level: number): SVOChunk {
  return {
    ci,
    cj,
    ck,
    level,
    blocks: new Map(),
    dirty: true,
    meshDirty: true,
  }
}

/** Clone a chunk shallowly with a fresh `blocks` Map. */
function cloneChunk(c: SVOChunk): SVOChunk {
  return {
    ci: c.ci,
    cj: c.cj,
    ck: c.ck,
    level: c.level,
    blocks: new Map(c.blocks),
    dirty: true,
    meshDirty: true,
  }
}

/** Mark adjacent chunks meshDirty when a cell on the face boundary
 *  changes — face culling depends on the neighbouring chunk's state. */
function markNeighbourMeshDirty(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  ci: number,
  cj: number,
  ck: number,
  level: number,
  i: number,
  j: number,
  k: number,
): Map<string, SVOChunk> {
  const localI = i - ci * CHUNK_SIZE
  const localJ = j - cj * CHUNK_SIZE
  const localK = k - ck * CHUNK_SIZE
  const offsets: Array<[number, number, number]> = []
  if (localI === 0) offsets.push([-1, 0, 0])
  if (localI === CHUNK_SIZE - 1) offsets.push([1, 0, 0])
  if (localJ === 0) offsets.push([0, -1, 0])
  if (localJ === CHUNK_SIZE - 1) offsets.push([0, 1, 0])
  if (localK === 0) offsets.push([0, 0, -1])
  if (localK === CHUNK_SIZE - 1) offsets.push([0, 0, 1])
  if (offsets.length === 0) return chunks
  let next = chunks
  let cloned = false
  for (const [di, dj, dk] of offsets) {
    const key = chunkKey(ci + di, cj + dj, ck + dk, level, layerId)
    const neigh = next.get(key)
    if (!neigh || neigh.meshDirty) continue
    if (!cloned) {
      next = new Map(next)
      cloned = true
    }
    next.set(key, { ...neigh, meshDirty: true })
  }
  return next
}

// ── Read ────────────────────────────────────────────────────────────────

export function getBlock(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): Block | undefined {
  const chunk = findChunk(chunks, layerId, i, j, k, level)
  if (!chunk) return undefined
  return chunk.blocks.get(blockKey(i, j, k))
}

// ── Mutate ──────────────────────────────────────────────────────────────

/** Write a block. Air-typed writes route to `removeBlock`. */
export function setBlock(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  block: Block,
): Map<string, SVOChunk> {
  if (block.type === 'air') {
    return removeBlock(chunks, layerId, block.i, block.j, block.k, block.level)
  }
  const { i, j, k, level } = block
  const { ci, cj, ck } = positionToChunkCoords(i, j, k)
  const key = chunkKey(ci, cj, ck, level, layerId)
  const next = new Map(chunks)
  const existing = next.get(key)
  const chunk = existing ? cloneChunk(existing) : emptyChunk(ci, cj, ck, level)
  chunk.blocks.set(blockKey(i, j, k), block)
  next.set(key, chunk)
  return markNeighbourMeshDirty(next, layerId, ci, cj, ck, level, i, j, k)
}

export function removeBlock(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): Map<string, SVOChunk> {
  const { ci, cj, ck } = positionToChunkCoords(i, j, k)
  const key = chunkKey(ci, cj, ck, level, layerId)
  const existing = chunks.get(key)
  if (!existing) return chunks
  const bk = blockKey(i, j, k)
  if (!existing.blocks.has(bk)) return chunks
  const next = new Map(chunks)
  const chunk = cloneChunk(existing)
  chunk.blocks.delete(bk)
  if (chunk.blocks.size === 0) {
    next.delete(key)
  } else {
    next.set(key, chunk)
  }
  return markNeighbourMeshDirty(next, layerId, ci, cj, ck, level, i, j, k)
}

/** Split a level-N block into 8 level-(N-1) children of the same type.
 *  No-op if the parent doesn't exist or level is already 0. */
export function splitBlock(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): Map<string, SVOChunk> {
  if (level <= 0) return chunks
  const parent = getBlock(chunks, layerId, i, j, k, level)
  if (!parent) return chunks
  let next = removeBlock(chunks, layerId, i, j, k, level)
  for (let di = 0; di < 2; di++) {
    for (let dj = 0; dj < 2; dj++) {
      for (let dk = 0; dk < 2; dk++) {
        const child: Block = {
          ...parent,
          i: 2 * i + di,
          j: 2 * j + dj,
          k: 2 * k + dk,
          level: level - 1,
        }
        next = setBlock(next, layerId, child)
      }
    }
  }
  return next
}

/** Collapse 8 level-N siblings to a single level-(N+1) parent if all
 *  eight exist and share the same type. No-op otherwise. */
export function mergeBlocks(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): Map<string, SVOChunk> {
  const pi = Math.floor(i / 2)
  const pj = Math.floor(j / 2)
  const pk = Math.floor(k / 2)
  const siblings: Block[] = []
  for (let di = 0; di < 2; di++) {
    for (let dj = 0; dj < 2; dj++) {
      for (let dk = 0; dk < 2; dk++) {
        const b = getBlock(chunks, layerId, 2 * pi + di, 2 * pj + dj, 2 * pk + dk, level)
        if (!b) return chunks
        siblings.push(b)
      }
    }
  }
  const type = siblings[0].type
  if (!siblings.every(s => s.type === type)) return chunks
  let next = chunks
  for (const s of siblings) {
    next = removeBlock(next, layerId, s.i, s.j, s.k, s.level)
  }
  // Carry over the first sibling's material/textures/attrs onto the parent.
  const proto = siblings[0]
  return setBlock(next, layerId, {
    i: pi,
    j: pj,
    k: pk,
    level: level + 1,
    type,
    materialPreset: proto.materialPreset,
    faceTextures: proto.faceTextures,
    attrs: proto.attrs,
  })
}

// ── Flood fill ──────────────────────────────────────────────────────────

const FACE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** 3D BFS — replace every cell of `targetType` connected to (i,j,k)
 *  with `fillType`. If `targetType === 'air'` we walk through absent
 *  cells (and stop at any present block). The walk is bounded by
 *  `maxBlocks` to keep runaway floods cheap; over-budget cells are
 *  silently dropped. The walk never crosses level boundaries. */
export function floodFill(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  startI: number,
  startJ: number,
  startK: number,
  level: number,
  targetType: BlockType,
  fillType: BlockType,
  maxBlocks: number,
): Map<string, SVOChunk> {
  if (targetType === fillType) return chunks
  const startBlock = getBlock(chunks, layerId, startI, startJ, startK, level)
  const startMatches = targetType === 'air'
    ? startBlock === undefined
    : startBlock?.type === targetType
  if (!startMatches) return chunks

  const queue: Array<[number, number, number]> = [[startI, startJ, startK]]
  const visited = new Set<string>([blockKey(startI, startJ, startK)])
  let next = chunks
  let filled = 0

  while (queue.length > 0 && filled < maxBlocks) {
    const [i, j, k] = queue.shift()!
    const cur = getBlock(next, layerId, i, j, k, level)
    const matches = targetType === 'air' ? cur === undefined : cur?.type === targetType
    if (!matches) continue

    if (fillType === 'air') {
      next = removeBlock(next, layerId, i, j, k, level)
    } else {
      next = setBlock(next, layerId, {
        // Carry over per-cell metadata when replacing a typed cell so
        // attrs survive a fill of (say) 'rock' → 'fill'. Air→solid
        // starts with a clean cell.
        ...(cur ?? {}),
        i,
        j,
        k,
        level,
        type: fillType,
      })
    }
    filled++

    for (const [di, dj, dk] of FACE_DIRS) {
      const ni = i + di
      const nj = j + dj
      const nk = k + dk
      const nk_key = blockKey(ni, nj, nk)
      if (visited.has(nk_key)) continue
      visited.add(nk_key)
      queue.push([ni, nj, nk])
    }
  }
  return next
}

// ── Water fill ──────────────────────────────────────────────────────────

/** Bounding box (inclusive) of all loaded chunks for one layer at one
 *  level. Returns null if no chunks are loaded. */
function loadedBounds(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  level: number,
): null | {
  iMin: number; iMax: number; jMin: number; jMax: number; kMin: number; kMax: number
} {
  let any = false
  let iMin = 0, iMax = 0, jMin = 0, jMax = 0, kMin = 0, kMax = 0
  for (const c of chunks.values()) {
    if (c.level !== level) continue
    const key = chunkKey(c.ci, c.cj, c.ck, level, layerId)
    if (!chunks.has(key)) continue
    const ci0 = c.ci * CHUNK_SIZE
    const ci1 = ci0 + CHUNK_SIZE - 1
    const cj0 = c.cj * CHUNK_SIZE
    const cj1 = cj0 + CHUNK_SIZE - 1
    const ck0 = c.ck * CHUNK_SIZE
    const ck1 = ck0 + CHUNK_SIZE - 1
    if (!any) {
      iMin = ci0; iMax = ci1; jMin = cj0; jMax = cj1; kMin = ck0; kMax = ck1
      any = true
    } else {
      if (ci0 < iMin) iMin = ci0
      if (ci1 > iMax) iMax = ci1
      if (cj0 < jMin) jMin = cj0
      if (cj1 > jMax) jMax = cj1
      if (ck0 < kMin) kMin = ck0
      if (ck1 > kMax) kMax = ck1
    }
  }
  return any ? { iMin, iMax, jMin, jMax, kMin, kMax } : null
}

/** Flood every air cell below `fillElevationAlt` connected to the
 *  edge of the loaded area with `water`. The seed is every boundary
 *  cell of the loaded bounding box that's air-and-below-elevation;
 *  the BFS expands inward. No-op when no chunks are loaded. */
export function waterFill(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  datum: SVODatum,
  fillElevationAlt: number,
  level: number,
): Map<string, SVOChunk> {
  const bounds = loadedBounds(chunks, layerId, level)
  if (!bounds) return chunks
  const { iMin, iMax, jMin, jMax, kMin, kMax } = bounds

  // Highest water cell by altitude — converts the elevation bound to
  // an exclusive k-cap so we don't BFS through cells that can never
  // hold water.
  const kCap = (() => {
    for (let k = kMax; k >= kMin; k--) {
      if (blockAltitude(k, level, datum) < fillElevationAlt) return k
    }
    return kMin - 1
  })()
  if (kCap < kMin) return chunks

  const isFillable = (i: number, j: number, k: number): boolean => {
    if (k > kCap) return false
    if (blockAltitude(k, level, datum) >= fillElevationAlt) return false
    return getBlock(chunks, layerId, i, j, k, level) === undefined
  }

  const queue: Array<[number, number, number]> = []
  const visited = new Set<string>()
  const enqueueIfFillable = (i: number, j: number, k: number) => {
    if (i < iMin || i > iMax || j < jMin || j > jMax || k < kMin || k > kCap) return
    const key = blockKey(i, j, k)
    if (visited.has(key)) return
    if (!isFillable(i, j, k)) return
    visited.add(key)
    queue.push([i, j, k])
  }

  // Seed: every boundary cell of the loaded box at or below kCap.
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let k = kMin; k <= kCap; k++) {
        const isBoundary =
          i === iMin || i === iMax || j === jMin || j === jMax || k === kMin || k === kCap
        if (isBoundary) enqueueIfFillable(i, j, k)
      }
    }
  }

  let next = chunks
  while (queue.length > 0) {
    const [i, j, k] = queue.shift()!
    next = setBlock(next, layerId, { i, j, k, level, type: 'water' })
    for (const [di, dj, dk] of FACE_DIRS) {
      enqueueIfFillable(i + di, j + dj, k + dk)
    }
  }
  return next
}

// ── Generators ──────────────────────────────────────────────────────────

/** Evaluate a generator into a deterministic block list. Pure — does
 *  not consult the chunks state (water_fill is the exception and is
 *  routed through the engine action; here it returns []). */
export function evaluateGenerator(
  generator: SVOGenerator,
  _datum: SVODatum,
): Block[] {
  const { type, params, materialType, level } = generator
  switch (type) {
    case 'box_fill':
      return genBoxFill(params, materialType, level)
    case 'pyramid':
      return genPyramid(params, materialType, level)
    case 'wedge':
      return genWedge(params, materialType, level)
    case 'prism':
      return genPrism(params, materialType, level)
    case 'dome':
      return genDome(params, materialType, level)
    case 'terrain_mask':
      return genTerrainMask(params, materialType, level)
    case 'water_fill':
      // Water fills depend on existing chunks; the engine action
      // delegates to waterFill() and ignores this generator's output.
      return []
  }
}

function num(p: Record<string, unknown>, k: string, d = 0): number {
  const v = p[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function genBoxFill(p: Record<string, unknown>, type: BlockType, level: number): Block[] {
  const iMin = num(p, 'iMin')
  const iMax = num(p, 'iMax', iMin)
  const jMin = num(p, 'jMin')
  const jMax = num(p, 'jMax', jMin)
  const kMin = num(p, 'kMin')
  const kMax = num(p, 'kMax', kMin)
  const out: Block[] = []
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let k = kMin; k <= kMax; k++) {
        out.push({ i, j, k, level, type })
      }
    }
  }
  return out
}

function genPyramid(p: Record<string, unknown>, type: BlockType, level: number): Block[] {
  const center = (p.center as [number, number, number] | undefined) ?? [0, 0, 0]
  const baseHalf = num(p, 'baseHalf', 4)
  const height = num(p, 'height', baseHalf)
  const slope = num(p, 'slope', 1)
  const out: Block[] = []
  for (let h = 0; h < height; h++) {
    const half = Math.max(0, Math.floor(baseHalf - h * slope))
    for (let di = -half; di <= half; di++) {
      for (let dj = -half; dj <= half; dj++) {
        out.push({ i: center[0] + di, j: center[1] + dj, k: center[2] + h, level, type })
      }
    }
  }
  return out
}

function genWedge(p: Record<string, unknown>, type: BlockType, level: number): Block[] {
  const iMin = num(p, 'iMin')
  const iMax = num(p, 'iMax', iMin)
  const jMin = num(p, 'jMin')
  const jMax = num(p, 'jMax', jMin)
  const kBase = num(p, 'kBase')
  const kTopMin = num(p, 'kTopMin', kBase)
  const kTopMax = num(p, 'kTopMax', kTopMin)
  const span = Math.max(1, iMax - iMin)
  const out: Block[] = []
  for (let i = iMin; i <= iMax; i++) {
    const t = (i - iMin) / span
    const kTop = Math.round(kTopMin + (kTopMax - kTopMin) * t)
    const top = Math.max(kBase, kTop)
    for (let j = jMin; j <= jMax; j++) {
      for (let k = kBase; k <= top; k++) {
        out.push({ i, j, k, level, type })
      }
    }
  }
  return out
}

function genPrism(p: Record<string, unknown>, type: BlockType, level: number): Block[] {
  const footprint = (p.footprint as Array<[number, number]> | undefined) ?? []
  const kBase = num(p, 'kBase')
  const kTop = num(p, 'kTop', kBase)
  if (footprint.length < 3 || kTop < kBase) return []
  // Bounding box of the polygon for the scanline.
  let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity
  for (const [pi, pj] of footprint) {
    if (pi < iMin) iMin = pi
    if (pi > iMax) iMax = pi
    if (pj < jMin) jMin = pj
    if (pj > jMax) jMax = pj
  }
  const out: Block[] = []
  for (let i = Math.floor(iMin); i <= Math.ceil(iMax); i++) {
    for (let j = Math.floor(jMin); j <= Math.ceil(jMax); j++) {
      if (!pointInPolygon(i + 0.5, j + 0.5, footprint)) continue
      for (let k = kBase; k <= kTop; k++) {
        out.push({ i, j, k, level, type })
      }
    }
  }
  return out
}

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function genDome(p: Record<string, unknown>, type: BlockType, level: number): Block[] {
  const center = (p.center as [number, number, number] | undefined) ?? [0, 0, 0]
  const rx = Math.max(1, num(p, 'rx', 4))
  const ry = Math.max(1, num(p, 'ry', rx))
  const rz = Math.max(1, num(p, 'rz', rx))
  const halfOnly = p.halfOnly !== false  // default to upper-hemisphere dome
  const out: Block[] = []
  for (let di = -Math.ceil(rx); di <= Math.ceil(rx); di++) {
    for (let dj = -Math.ceil(ry); dj <= Math.ceil(ry); dj++) {
      const kStart = halfOnly ? 0 : -Math.ceil(rz)
      for (let dk = kStart; dk <= Math.ceil(rz); dk++) {
        const v = (di / rx) ** 2 + (dj / ry) ** 2 + (dk / rz) ** 2
        if (v <= 1) {
          out.push({ i: center[0] + di, j: center[1] + dj, k: center[2] + dk, level, type })
        }
      }
    }
  }
  return out
}

function genTerrainMask(
  p: Record<string, unknown>,
  type: BlockType,
  level: number,
): Block[] {
  const iMin = num(p, 'iMin')
  const jMin = num(p, 'jMin')
  const baseK = num(p, 'baseK')
  const heightmap = p.heightmap as number[][] | undefined
  if (!heightmap || heightmap.length === 0) return []
  const out: Block[] = []
  for (let di = 0; di < heightmap.length; di++) {
    const row = heightmap[di]
    if (!row) continue
    for (let dj = 0; dj < row.length; dj++) {
      const top = Math.round(row[dj])
      for (let k = baseK; k <= top; k++) {
        out.push({ i: iMin + di, j: jMin + dj, k, level, type })
      }
    }
  }
  return out
}

// ── Face culling ────────────────────────────────────────────────────────

const FACE_OFFSETS: ReadonlyArray<readonly [BlockFace, number, number, number]> = [
  ['top', 0, 0, 1],
  ['bottom', 0, 0, -1],
  ['north', 0, 1, 0],
  ['south', 0, -1, 0],
  ['east', 1, 0, 0],
  ['west', -1, 0, 0],
]

/** Faces of (i,j,k,level) that are not occluded by a same-level
 *  solid neighbour. Returns [] if the block itself is air/absent. */
export function getExposedFaces(
  chunks: Map<string, SVOChunk>,
  layerId: string,
  i: number,
  j: number,
  k: number,
  level: number,
): BlockFace[] {
  const self = getBlock(chunks, layerId, i, j, k, level)
  if (!self || self.type === 'air') return []
  const out: BlockFace[] = []
  for (const [face, di, dj, dk] of FACE_OFFSETS) {
    const n = getBlock(chunks, layerId, i + di, j + dj, k + dk, level)
    if (!n || n.type === 'air') out.push(face)
  }
  return out
}
