/**
 * Tests for svoOps — block keys, set/get, flood fill, generators,
 * split/merge roundtrip, water fill.
 *
 * The Cesium-dependent helpers (enuMath) aren't exercised here —
 * those need a Cesium runtime and live tests will cover them.
 */
import { describe, expect, it } from 'vitest'
import {
  blockKey,
  chunkKey,
  evaluateGenerator,
  floodFill,
  getBlock,
  getExposedFaces,
  mergeBlocks,
  parseBlockKey,
  removeBlock,
  setBlock,
  splitBlock,
  waterFill,
} from '../svoOps'
import { CHUNK_SIZE, type Block, type SVOChunk, type SVODatum, type SVOGenerator } from '../types'

const LAYER = 'lyr-test'
const DATUM: SVODatum = { lon: 144.9631, lat: -37.8136, alt: 0 }

function block(i: number, j: number, k: number, type: Block['type'] = 'rock', level = 0): Block {
  return { i, j, k, level, type }
}

describe('keys', () => {
  it('blockKey roundtrips through parseBlockKey', () => {
    for (const [i, j, k] of [[0, 0, 0], [-3, 7, -100], [16, 16, 16]] as const) {
      expect(parseBlockKey(blockKey(i, j, k))).toEqual([i, j, k])
    }
  })

  it('chunkKey is layer-namespaced', () => {
    expect(chunkKey(0, 0, 0, 0, 'a')).not.toBe(chunkKey(0, 0, 0, 0, 'b'))
    expect(chunkKey(0, 0, 0, 0, 'a')).not.toBe(chunkKey(0, 0, 0, 1, 'a'))
  })
})

describe('setBlock / getBlock', () => {
  it('writes and reads a block', () => {
    const c0 = new Map<string, SVOChunk>()
    const c1 = setBlock(c0, LAYER, block(2, 3, 4, 'rock'))
    expect(c0.size).toBe(0) // immutable — original untouched
    expect(c1.size).toBe(1)
    expect(getBlock(c1, LAYER, 2, 3, 4, 0)?.type).toBe('rock')
  })

  it('air writes route to remove', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0, 'rock'))
    c = setBlock(c, LAYER, { ...block(0, 0, 0), type: 'air' })
    expect(getBlock(c, LAYER, 0, 0, 0, 0)).toBeUndefined()
    expect(c.size).toBe(0) // empty chunk dropped
  })

  it('removeBlock drops empty chunks', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0))
    c = setBlock(c, LAYER, block(0, 0, 1))
    expect(c.size).toBe(1) // both in same chunk
    c = removeBlock(c, LAYER, 0, 0, 0, 0)
    expect(c.size).toBe(1) // chunk still has (0,0,1)
    c = removeBlock(c, LAYER, 0, 0, 1, 0)
    expect(c.size).toBe(0)
  })

  it('blocks at far indices land in different chunks', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0))
    c = setBlock(c, LAYER, block(CHUNK_SIZE, 0, 0))
    expect(c.size).toBe(2)
  })
})

describe('floodFill', () => {
  it('fills a 3x3x3 air pocket inside a rock shell', () => {
    let c = new Map<string, SVOChunk>()
    // Build a 5x5x5 rock cube at the origin, then carve a 3x3x3 hole.
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        for (let k = 0; k < 5; k++) {
          c = setBlock(c, LAYER, block(i, j, k, 'rock'))
        }
      }
    }
    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 3; j++) {
        for (let k = 1; k <= 3; k++) {
          c = removeBlock(c, LAYER, i, j, k, 0)
        }
      }
    }
    // Flood fill the hole with water.
    c = floodFill(c, LAYER, 2, 2, 2, 0, 'air', 'water', 1000)
    let water = 0
    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 3; j++) {
        for (let k = 1; k <= 3; k++) {
          if (getBlock(c, LAYER, i, j, k, 0)?.type === 'water') water++
        }
      }
    }
    expect(water).toBe(27)
    // The shell stays rock.
    expect(getBlock(c, LAYER, 0, 0, 0, 0)?.type).toBe('rock')
  })

  it('respects the maxBlocks cap', () => {
    // Open air; flood fill a small budget — water should stop early.
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0, 'rock')) // anchor a chunk so absent cells exist
    c = removeBlock(c, LAYER, 0, 0, 0, 0)
    c = floodFill(c, LAYER, 0, 0, 0, 0, 'air', 'water', 5)
    let water = 0
    for (const chunk of c.values()) {
      for (const b of chunk.blocks.values()) {
        if (b.type === 'water') water++
      }
    }
    expect(water).toBeLessThanOrEqual(5)
    expect(water).toBeGreaterThan(0)
  })
})

describe('evaluateGenerator', () => {
  it('box_fill generates the right block count', () => {
    const gen: SVOGenerator = {
      id: 'g',
      type: 'box_fill',
      params: { iMin: 0, iMax: 2, jMin: 0, jMax: 2, kMin: 0, kMax: 2 },
      materialType: 'rock',
      level: 0,
    }
    const blocks = evaluateGenerator(gen, DATUM)
    expect(blocks.length).toBe(27)
    expect(blocks.every(b => b.type === 'rock' && b.level === 0)).toBe(true)
  })

  it('water_fill evaluates to empty (handled by waterFill action)', () => {
    const gen: SVOGenerator = {
      id: 'g',
      type: 'water_fill',
      params: { fillElevationAlt: 0 },
      materialType: 'water',
      level: 0,
    }
    expect(evaluateGenerator(gen, DATUM)).toEqual([])
  })

  it('prism extrudes a square footprint', () => {
    const gen: SVOGenerator = {
      id: 'g',
      type: 'prism',
      params: {
        footprint: [[0, 0], [3, 0], [3, 3], [0, 3]],
        kBase: 0,
        kTop: 2,
      },
      materialType: 'concrete',
      level: 0,
    }
    const blocks = evaluateGenerator(gen, DATUM)
    // Square covers 3x3 cells (i and j in {0,1,2}) × 3 layers (k 0..2).
    expect(blocks.length).toBe(27)
  })
})

describe('split / merge roundtrip', () => {
  it('split produces 8 children of the same type', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, { i: 1, j: 1, k: 1, level: 2, type: 'concrete' })
    c = splitBlock(c, LAYER, 1, 1, 1, 2)
    // Parent gone.
    expect(getBlock(c, LAYER, 1, 1, 1, 2)).toBeUndefined()
    // 8 children at level 1 with indices 2..3 in each axis.
    let n = 0
    for (let di = 0; di < 2; di++) {
      for (let dj = 0; dj < 2; dj++) {
        for (let dk = 0; dk < 2; dk++) {
          const b = getBlock(c, LAYER, 2 + di, 2 + dj, 2 + dk, 1)
          if (b?.type === 'concrete') n++
        }
      }
    }
    expect(n).toBe(8)
  })

  it('merge collapses 8 same-type siblings to a single parent', () => {
    let c = new Map<string, SVOChunk>()
    for (let di = 0; di < 2; di++) {
      for (let dj = 0; dj < 2; dj++) {
        for (let dk = 0; dk < 2; dk++) {
          c = setBlock(c, LAYER, { i: 2 + di, j: 4 + dj, k: 6 + dk, level: 1, type: 'rock' })
        }
      }
    }
    c = mergeBlocks(c, LAYER, 2, 4, 6, 1)
    expect(getBlock(c, LAYER, 1, 2, 3, 2)?.type).toBe('rock')
    // No level-1 leftovers.
    for (let di = 0; di < 2; di++) {
      for (let dj = 0; dj < 2; dj++) {
        for (let dk = 0; dk < 2; dk++) {
          expect(getBlock(c, LAYER, 2 + di, 4 + dj, 6 + dk, 1)).toBeUndefined()
        }
      }
    }
  })

  it('merge is a no-op when sibling types differ', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, { i: 0, j: 0, k: 0, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 1, j: 0, k: 0, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 0, j: 1, k: 0, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 1, j: 1, k: 0, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 0, j: 0, k: 1, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 1, j: 0, k: 1, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 0, j: 1, k: 1, level: 1, type: 'rock' })
    c = setBlock(c, LAYER, { i: 1, j: 1, k: 1, level: 1, type: 'concrete' }) // odd one
    const before = c
    c = mergeBlocks(c, LAYER, 0, 0, 0, 1)
    expect(c).toBe(before) // referentially identical → merge bailed
  })

  it('split → merge roundtrip restores the parent', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, { i: 5, j: 5, k: 5, level: 2, type: 'concrete' })
    c = splitBlock(c, LAYER, 5, 5, 5, 2)
    c = mergeBlocks(c, LAYER, 10, 10, 10, 1) // any one of the 8 children
    expect(getBlock(c, LAYER, 5, 5, 5, 2)?.type).toBe('concrete')
  })
})

describe('waterFill', () => {
  it('fills air cells below elevation, leaves cells above untouched', () => {
    // Build a single chunk anchored by a corner block. Block size at
    // level 0 = 0.125 m, so k = 4 sits at 0.5625 m altitude (centre)
    // when datum.alt = 0.
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0, 'rock'))
    c = setBlock(c, LAYER, block(15, 15, 15, 'rock'))
    // Carve a hole — make the cube around (5..10) air.
    for (let i = 5; i <= 10; i++) {
      for (let j = 5; j <= 10; j++) {
        for (let k = 0; k <= 10; k++) {
          c = removeBlock(c, LAYER, i, j, k, 0)
        }
      }
    }
    // Fill below altitude 0.5 m. Block size 0.125 → blocks 0..3 are
    // fully below, block 4 centre = 0.5625 m → above the cap.
    c = waterFill(c, LAYER, DATUM, 0.5, 0)
    // Boundary cells are reachable, so water should appear at
    // bordering air cells.
    let water = 0
    let aboveCap = 0
    for (const chunk of c.values()) {
      for (const b of chunk.blocks.values()) {
        if (b.type === 'water') {
          water++
          if (b.k >= 4) aboveCap++
        }
      }
    }
    expect(water).toBeGreaterThan(0)
    expect(aboveCap).toBe(0) // never above the elevation cap
  })

  it('is a no-op when no chunks are loaded', () => {
    const c = new Map<string, SVOChunk>()
    const next = waterFill(c, LAYER, DATUM, 100, 0)
    expect(next).toBe(c)
  })
})

describe('getExposedFaces', () => {
  it('isolated block exposes all six faces', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0))
    expect(getExposedFaces(c, LAYER, 0, 0, 0, 0).sort()).toEqual(
      ['bottom', 'east', 'north', 'south', 'top', 'west'],
    )
  })

  it('block surrounded on top hides its top face', () => {
    let c = new Map<string, SVOChunk>()
    c = setBlock(c, LAYER, block(0, 0, 0))
    c = setBlock(c, LAYER, block(0, 0, 1))
    const faces = getExposedFaces(c, LAYER, 0, 0, 0, 0)
    expect(faces).not.toContain('top')
    expect(faces).toContain('bottom')
  })
})
