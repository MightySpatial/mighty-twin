/**
 * useVoxelGlobeWiring — orchestrates the globe-pick lifecycle for voxel
 * tools that need spatial input.
 *
 * Two flows are wired here:
 *
 *   1. Polygon-borrow tools (`voxel_prism`, `voxel_terrain_mask`).
 *      When the user picks one of these tools we activate the CAD
 *      polygon tool so they can draw on the globe with the existing
 *      tool UX. When the user clicks Apply in the voxel params (a
 *      `voxel:apply` window event) we look up the most recently
 *      committed polygon node in the active sketch, grab its positions,
 *      and dispatch the appropriate engine action.
 *
 *   2. Apply events for non-spatial tools (box / pyramid / wedge / dome
 *      / water). Apply just stamps using the active layer's datum +
 *      the editor's active level + active material.
 *
 * Cesium terrain sampling is the only Cesium-aware bit; the engine
 * itself stays Cesium-free.
 */
import { useEffect } from 'react'
import {
  Cartographic,
  sampleTerrainMostDetailed,
  type Viewer as CesiumViewerType,
} from 'cesium'
import { useCadEngine } from '../sketch/useCadEngine'
import { useSvoEngine } from './useSvoEngine'
import { useVoxelToolParams } from './tools/useVoxelToolParams'
import { lonLatAltToEnu, blockSizeAtLevel } from './enuMath'
import type { SVOGenerator } from './types'

/** Tool ids that delegate their footprint to the CAD polygon tool. */
const POLYGON_TOOLS = new Set(['voxel_prism', 'voxel_terrain_mask'])

interface Args {
  viewer: CesiumViewerType | null
}

export function useVoxelGlobeWiring({ viewer }: Args) {
  const voxelTool = useSvoEngine(s => s.activeToolId)
  const setVoxelTool = useSvoEngine(s => s.setActiveTool)
  const activeLayer = useSvoEngine(s =>
    s.activeLayerId ? s.layers.find(l => l.id === s.activeLayerId) ?? null : null,
  )
  const activeLevel = useSvoEngine(s => s.activeLevel)
  const activeMaterial = useSvoEngine(s => s.activeMaterialType)
  const addGenerator = useSvoEngine(s => s.addGenerator)
  const applyGenerator = useSvoEngine(s => s.applyGenerator)
  const waterFill = useSvoEngine(s => s.waterFill)
  const applyTerrainMask = useSvoEngine(s => s.applyTerrainMask)

  const setCadTool = useCadEngine(s => s.setActiveTool)
  const cadTool = useCadEngine(s => s.activeToolId)

  // ── Activate CAD polygon tool when a polygon-borrow voxel tool is
  // picked, restore CAD tool when the voxel tool is cleared.
  useEffect(() => {
    if (voxelTool && POLYGON_TOOLS.has(voxelTool)) {
      if (cadTool !== 'polygon') setCadTool('polygon')
    } else {
      if (cadTool === 'polygon') setCadTool(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voxelTool])

  // ── Listen for `voxel:apply` events from the params panels.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ tool: string }>).detail
      const toolId = detail?.tool
      if (!toolId || !activeLayer) return

      switch (toolId) {
        case 'voxel_box': return runBoxFill(toolId)
        case 'voxel_pyramid': return runPyramid(toolId)
        case 'voxel_wedge': return runWedge(toolId)
        case 'voxel_dome': return runDome(toolId)
        case 'voxel_prism': return runPrism(toolId)
        case 'voxel_water': return runWater(toolId)
        case 'voxel_terrain_mask': return runTerrainMask(toolId)
      }
    }
    window.addEventListener('voxel:apply', handler)
    return () => window.removeEventListener('voxel:apply', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer?.id, activeLevel, activeMaterial, voxelTool, viewer])

  function runBoxFill(toolId: string) {
    if (!activeLayer) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const w = Math.max(1, asInt(p.width, 4))
    const d = Math.max(1, asInt(p.depth, 4))
    const h = Math.max(1, asInt(p.height, 4))
    const generator: SVOGenerator = {
      id: genId('box'),
      type: 'box_fill',
      level: activeLevel,
      materialType: activeMaterial,
      params: {
        iMin: 0,         iMax: w - 1,
        jMin: 0,         jMax: d - 1,
        kMin: 0,         kMax: h - 1,
      },
    }
    addGenerator(activeLayer.id, generator)
    applyGenerator(activeLayer.id, generator.id)
  }

  function runPyramid(toolId: string) {
    if (!activeLayer) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const baseW = Math.max(1, asInt(p.baseW, 8))
    const height = Math.max(1, asInt(p.height, 6))
    // Average of N/S/E/W angles → tan-based slope (blocks per course).
    const angles = [
      asNum(p.angleN, 45), asNum(p.angleS, 45),
      asNum(p.angleE, 45), asNum(p.angleW, 45),
    ]
    const avg = angles.reduce((s, a) => s + a, 0) / angles.length
    const slope = Math.max(0, Math.tan((avg * Math.PI) / 180))
    const generator: SVOGenerator = {
      id: genId('pyramid'),
      type: 'pyramid',
      level: activeLevel,
      materialType: activeMaterial,
      params: {
        center: [0, 0, 0],
        baseHalf: Math.floor(baseW / 2),
        height,
        slope,
      },
    }
    addGenerator(activeLayer.id, generator)
    applyGenerator(activeLayer.id, generator.id)
  }

  function runWedge(toolId: string) {
    if (!activeLayer) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const baseW = Math.max(1, asInt(p.baseW, 8))
    const baseD = Math.max(1, asInt(p.baseD, 8))
    const height = Math.max(1, asInt(p.height, 4))
    const dir = String(p.direction ?? 'N')
    // Map compass → which face is high vs low. We only have a 2-axis
    // wedge generator (i increasing → kTop varies); pick the i-axis
    // alignment so 'E' rises east, 'W' rises west, 'N' rises north
    // (we swap iMin/iMax for the latter via the kTopMin/kTopMax pair).
    let kTopMin = 0
    let kTopMax = height - 1
    if (dir.includes('W') || dir === 'S') {
      [kTopMin, kTopMax] = [kTopMax, kTopMin]
    }
    const generator: SVOGenerator = {
      id: genId('wedge'),
      type: 'wedge',
      level: activeLevel,
      materialType: activeMaterial,
      params: {
        iMin: 0, iMax: baseW - 1,
        jMin: 0, jMax: baseD - 1,
        kBase: 0,
        kTopMin, kTopMax,
      },
    }
    addGenerator(activeLayer.id, generator)
    applyGenerator(activeLayer.id, generator.id)
  }

  function runDome(toolId: string) {
    if (!activeLayer) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const generator: SVOGenerator = {
      id: genId('dome'),
      type: 'dome',
      level: activeLevel,
      materialType: activeMaterial,
      params: {
        center: [0, 0, 0],
        rx: Math.max(1, asNum(p.rW, 6)),
        ry: Math.max(1, asNum(p.rD, 6)),
        rz: Math.max(1, asNum(p.rH, 4)),
        halfOnly: p.halfOnly !== false,
      },
    }
    addGenerator(activeLayer.id, generator)
    applyGenerator(activeLayer.id, generator.id)
  }

  function runPrism(toolId: string) {
    if (!activeLayer) return
    const positions = lastPolygonPositions()
    if (!positions || positions.length < 3) {
      // No polygon drawn yet — silently no-op. The toolbox hint guides
      // the user to draw one.
      return
    }
    const p = useVoxelToolParams.getState().getParams(toolId)
    const baseAlt = asNum(p.baseAlt, 0)
    const heightBlocks = Math.max(1, asInt(p.height, 5))
    const s = blockSizeAtLevel(activeLevel)
    // Convert WGS84 polygon vertices → ENU (i, j) at the active level.
    const footprint: [number, number][] = positions.map(pos => {
      const [lon, lat, alt = baseAlt] = pos
      const enu = lonLatAltToEnu(lon, lat, alt, activeLayer.datum)
      return [enu[0] / s, enu[1] / s]
    })
    const baseK = Math.floor(baseAlt / s)
    const generator: SVOGenerator = {
      id: genId('prism'),
      type: 'prism',
      level: activeLevel,
      materialType: activeMaterial,
      params: {
        footprint,
        kBase: baseK,
        kTop: baseK + heightBlocks - 1,
      },
    }
    addGenerator(activeLayer.id, generator)
    applyGenerator(activeLayer.id, generator.id)
  }

  function runWater(toolId: string) {
    if (!activeLayer) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const fillElevAlt = asNum(p.fillElevAlt, 0)
    waterFill(activeLayer.id, fillElevAlt, activeLevel)
  }

  async function runTerrainMask(toolId: string) {
    if (!activeLayer || !viewer) return
    const positions = lastPolygonPositions()
    if (!positions || positions.length < 3) return
    const p = useVoxelToolParams.getState().getParams(toolId)
    const depthBlocks = Math.max(0, asInt(p.depth, 2))

    const s = blockSizeAtLevel(activeLevel)
    // Polygon WGS84 → ENU (in metres, then to grid via blockSize).
    const enuVerts = positions.map(pos => {
      const [lon, lat, alt = 0] = pos
      return lonLatAltToEnu(lon, lat, alt, activeLayer.datum)
    })
    let iMinM = Infinity, iMaxM = -Infinity
    let jMinM = Infinity, jMaxM = -Infinity
    for (const [e, n] of enuVerts) {
      if (e < iMinM) iMinM = e
      if (e > iMaxM) iMaxM = e
      if (n < jMinM) jMinM = n
      if (n > jMaxM) jMaxM = n
    }
    const iMin = Math.floor(iMinM / s)
    const iMax = Math.ceil(iMaxM / s)
    const jMin = Math.floor(jMinM / s)
    const jMax = Math.ceil(jMaxM / s)
    const rows = iMax - iMin + 1
    const cols = jMax - jMin + 1
    if (rows <= 0 || cols <= 0 || rows * cols > 250_000) {
      // Guard against unreasonably big masks (a 500×500 grid at level 0
      // is already 250k samples; larger asks should bump the level).
      return
    }
    // Convert each grid cell centre back to lon/lat, sample terrain.
    const polyEnu2D = enuVerts.map(([e, n]) => [e, n] as [number, number])
    const cartos: Cartographic[] = []
    const indices: { di: number; dj: number; inside: boolean }[] = []
    for (let di = 0; di < rows; di++) {
      for (let dj = 0; dj < cols; dj++) {
        const eM = (iMin + di + 0.5) * s
        const nM = (jMin + dj + 0.5) * s
        const inside = pointInPolygon2D(eM, nM, polyEnu2D)
        if (inside) {
          // ENU → WGS84 via the engine's helper. Easier: lon/lat of the
          // datum + small east/north offset; for sites a few km across
          // a flat-earth approximation is fine.
          const lonOffset = eM / (111_320 * Math.cos((activeLayer.datum.lat * Math.PI) / 180))
          const latOffset = nM / 111_320
          cartos.push(Cartographic.fromDegrees(
            activeLayer.datum.lon + lonOffset,
            activeLayer.datum.lat + latOffset,
            0,
          ))
        }
        indices.push({ di, dj, inside })
      }
    }
    let sampled: Cartographic[] = []
    try {
      sampled = await sampleTerrainMostDetailed(viewer.terrainProvider, cartos)
    } catch {
      return
    }
    // Build the heightmap (rows × cols) — undefined for outside-polygon
    // cells; the genTerrainMask path skips those naturally.
    const heightmap: number[][] = []
    let cursor = 0
    for (let di = 0; di < rows; di++) {
      const row: number[] = new Array(cols).fill(NaN)
      for (let dj = 0; dj < cols; dj++) {
        const idx = di * cols + dj
        if (indices[idx]?.inside) {
          const h = sampled[cursor++]?.height
          if (typeof h === 'number') {
            // Convert real-world altitude → block k index, clamping
            // depth on the underside.
            const kTop = Math.floor((h - activeLayer.datum.alt) / s)
            row[dj] = kTop
          }
        }
      }
      heightmap.push(row)
    }
    const baseK = Math.min(
      ...heightmap.flat().filter(v => Number.isFinite(v)),
    ) - depthBlocks
    applyTerrainMask(activeLayer.id, {
      iMin, jMin, baseK,
      heightmap,
      materialType: activeMaterial,
      level: activeLevel,
    })
    // Drop the helper polygon node so it doesn't pollute the sketch.
    cleanupPolygonNode()
    setVoxelTool(null)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function asNum(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb
}
function asInt(v: unknown, fb: number): number {
  return Number.isFinite(v as number) ? Math.round(v as number) : fb
}
function genId(kind: string): string {
  return `gen_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Find the most recent polygon node in the active sketch and return
 *  its WGS84 positions. The polygon-borrow flow leaves a real polygon
 *  node behind; voxel tools read it once and (for terrain mask) drop
 *  it after stamping. */
function lastPolygonPositions(): Array<[number, number] | [number, number, number]> | null {
  const state = useCadEngine.getState()
  const sid = state.activeSketchId
  if (!sid) return null
  // Find any node whose params declare polygon geometry + has ≥3 pts.
  // We pick the most-recent by id-suffix timestamp ordering.
  const candidates = Object.values(state.nodes).filter(n => {
    const positions = n.params?.positions ?? []
    return n.params?.geometry === 'polygon' && positions.length >= 3
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (b.id > a.id ? 1 : -1))
  return candidates[0].params.positions ?? null
}

function cleanupPolygonNode(): void {
  const state = useCadEngine.getState()
  const candidates = Object.values(state.nodes).filter(n => {
    const positions = n.params?.positions ?? []
    return n.params?.geometry === 'polygon' && positions.length >= 3
  })
  if (candidates.length === 0) return
  candidates.sort((a, b) => (b.id > a.id ? 1 : -1))
  state.removeNode(candidates[0].id)
}

/** Even-odd point-in-polygon test in 2D. Mirrors the helper inside
 *  svoOps.genPrism — duplicated here so we can clip the heightmap
 *  before handing it to the engine. */
function pointInPolygon2D(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}
