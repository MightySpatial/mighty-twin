/**
 * useDagCesium — Cesium primitive lifecycle reconciler.
 *
 * Subscribes to the engine's `dirtySketches` set and reconciles the
 * Cesium DataSource entities against the current DAG state. Each
 * sketch node maps to one Cesium entity (or a small primitive group
 * for solids); when the node changes, its entities are removed and
 * re-added.
 *
 * Splitting this from the engine (vs v1's monolithic useCadEngine.js
 * which ran Cesium inline) lets the engine stay framework-light: the
 * DAG is testable in isolation, and v2 can swap the renderer (Mapbox,
 * deck.gl) by replacing this hook.
 */
import { useEffect, useRef } from 'react'
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  PolygonHierarchy,
  Viewer as CesiumViewerType,
} from 'cesium'
import { useCadEngine } from './useCadEngine'
import type { SketchNode } from './types'

export interface UseDagCesiumArgs {
  viewer: CesiumViewerType | null
}

/** Map of dag-node-id → cesium entity ids (one node may produce
 *  multiple entities for hollow solids). Lives in the hook ref so
 *  unmount can clean up everything. */
type NodeEntityMap = Record<string, string[]>

export function useDagCesium({ viewer }: UseDagCesiumArgs) {
  const entityMapRef = useRef<NodeEntityMap>({})

  useEffect(() => {
    if (!viewer) return

    // Initial reconciliation — render every node currently in the store.
    reconcileAll(viewer, useCadEngine.getState().nodes, entityMapRef.current)

    // Subscribe to dirty events. We use the granular subscription so
    // unrelated state changes (selection, active tool, etc.) don't kick
    // off a re-render here.
    const unsubDirty = useCadEngine.subscribe(
      s => s.dirtySketches,
      (dirty) => {
        if (dirty.size === 0) return
        const state = useCadEngine.getState()
        // For each dirty sketch, resync its nodes. Cheaper than walking
        // every node on every change, and matches the granularity v1
        // uses for its sketch-scoped re-evaluator.
        for (const sketchId of dirty) {
          if (sketchId === '__deleted__') continue
          reconcileSketch(viewer, sketchId, state.nodes, entityMapRef.current)
        }
        // Clean up entities for nodes that no longer exist.
        cleanupOrphans(viewer, state.nodes, entityMapRef.current)
      },
    )

    return () => {
      unsubDirty()
      // Tear down all entities we own when the hook unmounts.
      for (const ids of Object.values(entityMapRef.current)) {
        for (const id of ids) {
          const e = viewer.entities.getById(id)
          if (e) viewer.entities.remove(e)
        }
      }
      entityMapRef.current = {}
    }
  }, [viewer])
}

// ── Reconciliation ───────────────────────────────────────────────────────

function reconcileAll(
  viewer: CesiumViewerType,
  nodes: Record<string, SketchNode>,
  map: NodeEntityMap,
): void {
  for (const node of Object.values(nodes)) renderNode(viewer, node, map)
}

function reconcileSketch(
  viewer: CesiumViewerType,
  sketchId: string,
  nodes: Record<string, SketchNode>,
  map: NodeEntityMap,
): void {
  for (const node of Object.values(nodes)) {
    if (node.params.sketchId === sketchId) renderNode(viewer, node, map)
  }
}

function cleanupOrphans(
  viewer: CesiumViewerType,
  nodes: Record<string, SketchNode>,
  map: NodeEntityMap,
): void {
  for (const nodeId of Object.keys(map)) {
    if (!nodes[nodeId]) {
      for (const eid of map[nodeId]) {
        const e = viewer.entities.getById(eid)
        if (e) viewer.entities.remove(e)
      }
      delete map[nodeId]
    }
  }
}

function renderNode(
  viewer: CesiumViewerType,
  node: SketchNode,
  map: NodeEntityMap,
): void {
  // Drop existing entities for this node — re-add fresh.
  for (const eid of map[node.id] ?? []) {
    const e = viewer.entities.getById(eid)
    if (e) viewer.entities.remove(e)
  }
  map[node.id] = []

  const ents: Entity[] = []
  const geom = node.params.geometry
  const positions = node.params.positions ?? []

  if (geom === 'point' && positions.length >= 1) {
    const [lon, lat, alt = 0] = positions[0]
    ents.push(viewer.entities.add({
      id: cesiumId(node.id, 'pt'),
      position: new ConstantPositionProperty(Cartesian3.fromDegrees(lon, lat, alt)),
      point: {
        pixelSize: typeof node.style.pointSize === 'number' ? node.style.pointSize : 10,
        color: cesiumColor(node.style.fillColor ?? node.style.color, node.style.opacity),
        outlineColor: cesiumColor(node.style.outlineColor ?? node.style.color, 1.0),
        outlineWidth: node.style.outlineWidth ?? 2,
        heightReference: HeightReference.NONE,
      },
    }))
  } else if (geom === 'line' && positions.length >= 2) {
    ents.push(viewer.entities.add({
      id: cesiumId(node.id, 'ln'),
      polyline: {
        positions: positions.map(p => Cartesian3.fromDegrees(p[0], p[1], p[2] ?? 0)),
        width: node.style.lineWidth ?? 3,
        material: new ColorMaterialProperty(
          cesiumColor(node.style.color ?? node.style.fillColor, node.style.opacity),
        ),
        clampToGround: false,
      },
    }))
  } else if (geom === 'polygon' && positions.length >= 3) {
    const ring = positions.map(p => Cartesian3.fromDegrees(p[0], p[1], p[2] ?? 0))
    ents.push(viewer.entities.add({
      id: cesiumId(node.id, 'pg'),
      polygon: {
        hierarchy: new ConstantProperty(new PolygonHierarchy(ring)),
        material: new ColorMaterialProperty(
          cesiumColor(node.style.fillColor ?? node.style.color, node.style.fillOpacity ?? node.style.opacity),
        ),
        outline: true,
        outlineColor: cesiumColor(node.style.outlineColor ?? node.style.color, node.style.opacity),
        outlineWidth: node.style.outlineWidth ?? 2,
      },
    }))
  } else if (node.type === 'box' || node.type === 'pit' || node.type === 'cylinder') {
    // Solids — delegate to a thin renderer that mirrors v1's per-solid
    // shape. v2 already has solidCommit.ts; we'd ideally call into that
    // but it's keyed to the legacy SketchFeature shape. For now render a
    // simple box/cylinder primitive at positions[0].
    const p0 = positions[0]
    if (!p0) return
    const params = node.params
    const lon = p0[0], lat = p0[1], alt = (p0[2] ?? 0)
    const center = Cartesian3.fromDegrees(lon, lat, alt + (params.height ?? 1) / 2)
    const fill = cesiumColor(node.style.fillColor ?? node.style.color, (node.style.opacity ?? 0.7) * 0.65)
    const outline = cesiumColor(node.style.outlineColor ?? node.style.color, node.style.opacity)
    if (node.type === 'cylinder' || (node.type === 'pit' && params.shape === 'round')) {
      ents.push(viewer.entities.add({
        id: cesiumId(node.id, 'cy'),
        position: center,
        cylinder: {
          length: params.height ?? 1,
          topRadius: params.radius ?? 1,
          bottomRadius: params.radius ?? 1,
          material: new ColorMaterialProperty(fill),
          outline: true,
          outlineColor: outline,
        },
      }))
    } else {
      ents.push(viewer.entities.add({
        id: cesiumId(node.id, 'bx'),
        position: center,
        box: {
          dimensions: new Cartesian3(
            params.width ?? 1,
            params.depth ?? 1,
            params.height ?? 1,
          ),
          material: new ColorMaterialProperty(fill),
          outline: true,
          outlineColor: outline,
        },
      }))
    }
  }
  // Ops (extrude / pipe / loft) — derived geometry generation lives in
  // a follow-up pass; the engine treats them as no-op for rendering
  // until a per-type evaluator runs. v1's evaluator is ~600 lines of
  // CSG-ish work; out-of-scope for Phase 2 unless the v2 use cases
  // demand it.

  map[node.id] = ents.map(e => e.id)
}

// ── Helpers ──────────────────────────────────────────────────────────────

function cesiumId(nodeId: string, suffix: string): string {
  return `dag_${nodeId}_${suffix}`
}

function cesiumColor(hex: string | undefined, alpha: number | undefined): Color {
  const a = typeof alpha === 'number' ? alpha : 1.0
  try {
    return Color.fromCssColorString(hex ?? '#22d3ee').withAlpha(a)
  } catch {
    return Color.WHITE.withAlpha(a)
  }
}

// Stub helpers below kept exported so the test harness can drive the
// reconciler without a real Cesium viewer (passes through unused).
export const __testing = {
  reconcileAll,
  cleanupOrphans,
  cesiumColor,
}
