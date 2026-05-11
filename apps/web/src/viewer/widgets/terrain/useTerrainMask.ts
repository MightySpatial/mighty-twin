/** Terrain mask — owns the mask polygon, drives the picker, and
 *  applies the result to Cesium's globe + 3D tileset clipping pipeline.
 *
 *  The mask is a single GeoJSON-style ring (array of [lon, lat]
 *  positions in degrees). When set, the polygon "punches" through the
 *  globe and every primitive on the scene so what's normally hidden
 *  underground becomes visible. This is the foundation for the design
 *  widget → voxel integration: a voxel layer just hands its footprint
 *  to setMaskFromPositions() and the cut appears.
 *
 *  Cesium API used:
 *    - viewer.scene.globe.clippingPolygons — clips terrain
 *    - tileset.clippingPolygons — clips photogrammetry / OSM buildings
 *  Both live behind a `ClippingPolygonCollection` and a single
 *  `ClippingPolygon` with `inverse: true` so material inside the
 *  polygon is removed, not outside. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  Math as CesiumMath,
  Cesium3DTileset,
  PolylineCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer as CesiumViewerType,
} from 'cesium'

/** Lon/lat in degrees — the persisted/serialisable form. */
export interface MaskPosition {
  longitude: number
  latitude: number
}

export type MaskState =
  | { kind: 'idle' }
  | { kind: 'drawing'; positions: MaskPosition[] }
  | { kind: 'set';     positions: MaskPosition[]; source: 'drawn' | 'voxel' | 'site' }

export interface UseTerrainMaskApi {
  state: MaskState
  /** Begin globe-pick mode. Subsequent left-clicks append positions;
   *  a right-click / double-click commits; Escape cancels. */
  startDrawing: () => void
  cancelDrawing: () => void
  /** Commit the in-progress draft. Must have ≥3 positions. */
  finishDrawing: () => void
  /** Replace the mask with an explicit position ring (e.g. from a
   *  voxel layer's footprint or a saved site setting). */
  setMaskFromPositions: (
    positions: MaskPosition[],
    source: Extract<MaskState, { kind: 'set' }>['source'],
  ) => void
  clear: () => void
  /** True when the mask is currently applied to the scene. */
  active: boolean
}

/** Build a Cesium ClippingPolygonCollection from a position ring. */
function buildClippingCollection(positions: MaskPosition[]): ClippingPolygonCollection | null {
  if (positions.length < 3) return null
  const cartesians = positions.map(p =>
    Cartesian3.fromDegrees(p.longitude, p.latitude),
  )
  const polygon = new ClippingPolygon({ positions: cartesians })
  return new ClippingPolygonCollection({
    polygons: [polygon],
    // Inverse = subtract inside the polygon (carve a hole) rather
    // than the default clip-everything-outside.
    inverse: true,
  })
}

/** Walk every 3D tileset in the scene and apply (or clear) clipping
 *  polygons. Terrain has its own globe.clippingPolygons hook; this
 *  function handles photogrammetry, OSM buildings, and any custom
 *  tilesets registered via useLayerSync. */
function applyToTilesets(viewer: CesiumViewerType, coll: ClippingPolygonCollection | null) {
  const prims = viewer.scene.primitives
  for (let i = 0; i < prims.length; i++) {
    const p = prims.get(i) as unknown
    if (p instanceof Cesium3DTileset) {
      ;(p as Cesium3DTileset).clippingPolygons = coll ?? undefined as unknown as ClippingPolygonCollection
    }
  }
}

export function useTerrainMask(
  viewerRef: React.RefObject<CesiumViewerType | null>,
): UseTerrainMaskApi {
  const [state, setState] = useState<MaskState>({ kind: 'idle' })
  const stateRef = useRef(state)
  stateRef.current = state

  // Cesium handles we own — handler for clicks while drawing, and the
  // draft polyline shown live as the user picks vertices.
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const draftPolylinesRef = useRef<PolylineCollection | null>(null)

  // Apply / clear scene-side clipping whenever state.kind === 'set'
  // changes. Drawing/idle leave the scene un-clipped.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    if (state.kind === 'set') {
      const coll = buildClippingCollection(state.positions)
      if (coll) {
        viewer.scene.globe.clippingPolygons = coll
        applyToTilesets(viewer, coll)
      }
    } else {
      // Idle / drawing — make sure nothing's clipped.
      viewer.scene.globe.clippingPolygons = undefined as unknown as ClippingPolygonCollection
      applyToTilesets(viewer, null)
    }
  }, [state, viewerRef])

  // Draft polyline preview while drawing.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Lazy-create the polyline collection.
    if (!draftPolylinesRef.current) {
      const coll = new PolylineCollection()
      viewer.scene.primitives.add(coll)
      draftPolylinesRef.current = coll
    }
    const coll = draftPolylinesRef.current
    coll.removeAll()

    if (state.kind === 'drawing' && state.positions.length >= 2) {
      const cartesians = state.positions.map(p =>
        Cartesian3.fromDegrees(p.longitude, p.latitude),
      )
      // Close the loop visually so the user sees the polygon-to-be.
      cartesians.push(cartesians[0])
      coll.add({
        positions: cartesians,
        width: 2,
        material: undefined,
        // PolylineCollection uses per-line colour via the optional
        // appearance/material props on add(). Default white is fine
        // for a draft preview.
      })
    }

    return () => {
      // Don't tear down on every state change — only on unmount.
    }
  }, [state, viewerRef])

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return
      if (draftPolylinesRef.current) {
        try { viewer.scene.primitives.remove(draftPolylinesRef.current) } catch { /* torn down */ }
        draftPolylinesRef.current = null
      }
      if (handlerRef.current) {
        try { handlerRef.current.destroy() } catch { /* destroyed */ }
        handlerRef.current = null
      }
      viewer.scene.globe.clippingPolygons = undefined as unknown as ClippingPolygonCollection
      applyToTilesets(viewer, null)
    }
  }, [viewerRef])

  const startDrawing = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    setState({ kind: 'drawing', positions: [] })

    // Tear down any previous handler before wiring a new one so
    // re-entering draw mode doesn't double-fire.
    if (handlerRef.current) {
      try { handlerRef.current.destroy() } catch { /* destroyed */ }
      handlerRef.current = null
    }

    const handler = new ScreenSpaceEventHandler(viewer.canvas)
    handlerRef.current = handler

    handler.setInputAction((evt: { position: Cartesian2 }) => {
      const cur = stateRef.current
      if (cur.kind !== 'drawing') return
      const pos = new Cartesian2(evt.position.x, evt.position.y)
      const ray = viewer.camera.getPickRay(pos)
      if (!ray) return
      const c = viewer.scene.globe.pick(ray, viewer.scene)
      if (!c) return
      const carto = Cartographic.fromCartesian(c)
      const next: MaskPosition = {
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude:  CesiumMath.toDegrees(carto.latitude),
      }
      setState({ kind: 'drawing', positions: [...cur.positions, next] })
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction(() => {
      // Right-click or LEFT_DOUBLE_CLICK commits.
      finishDrawingRef.current()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    handler.setInputAction(() => {
      finishDrawingRef.current()
    }, ScreenSpaceEventType.RIGHT_CLICK)
  }, [viewerRef])

  const cancelDrawing = useCallback(() => {
    if (handlerRef.current) {
      try { handlerRef.current.destroy() } catch { /* destroyed */ }
      handlerRef.current = null
    }
    setState({ kind: 'idle' })
  }, [])

  const finishDrawing = useCallback(() => {
    const cur = stateRef.current
    if (cur.kind !== 'drawing') return
    if (cur.positions.length < 3) {
      // Not enough vertices — discard.
      cancelDrawing()
      return
    }
    if (handlerRef.current) {
      try { handlerRef.current.destroy() } catch { /* destroyed */ }
      handlerRef.current = null
    }
    setState({ kind: 'set', positions: cur.positions, source: 'drawn' })
  }, [cancelDrawing])

  // Capture finishDrawing in a ref so the click handler set up inside
  // startDrawing always invokes the current version (avoids capturing
  // a stale closure when state updates).
  const finishDrawingRef = useRef(finishDrawing)
  useEffect(() => { finishDrawingRef.current = finishDrawing }, [finishDrawing])

  const setMaskFromPositions = useCallback((
    positions: MaskPosition[],
    source: Extract<MaskState, { kind: 'set' }>['source'],
  ) => {
    if (positions.length < 3) return
    if (handlerRef.current) {
      try { handlerRef.current.destroy() } catch { /* destroyed */ }
      handlerRef.current = null
    }
    setState({ kind: 'set', positions, source })
  }, [])

  const clear = useCallback(() => {
    if (handlerRef.current) {
      try { handlerRef.current.destroy() } catch { /* destroyed */ }
      handlerRef.current = null
    }
    setState({ kind: 'idle' })
  }, [])

  const api = useMemo<UseTerrainMaskApi>(() => ({
    state,
    startDrawing,
    cancelDrawing,
    finishDrawing,
    setMaskFromPositions,
    clear,
    active: state.kind === 'set',
  }), [state, startDrawing, cancelDrawing, finishDrawing, setMaskFromPositions, clear])

  // Touch the Color import so the bundler doesn't strip it — we keep
  // it available for callers that want to override the draft polyline
  // tint via a future option.
  void Color

  return api
}
