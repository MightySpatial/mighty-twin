/**
 * MightyTwin — Traverse Tool
 * Bearing + distance polyline builder for surveyors.
 * Click to set start point (or enter lon/lat), then add legs
 * with bearing (degrees from north) and distance. Computes
 * polyline via ENU offsets and commits to the sketch layer.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  CallbackProperty,
  Math as CesiumMath,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature, TraverseDraft } from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  clampToGroundForDatum,
  cartesianToDegrees,
  enuOffsetToWorld,
} from './drawUtils'

const PREVIEW_ID = '__traverse_preview__'
const START_MARKER_ID = '__traverse_start__'

interface UseTraverseToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  traverseDraft: TraverseDraft | null
  onTraverseDraftChange: (draft: TraverseDraft | null) => void
  onFeatureAdded: (feature: SketchFeature) => void
}

/** Convert a traverse draft to an array of Cartesian3 positions. */
function computePositions(draft: TraverseDraft, elevConfig: ElevationConfig): Cartesian3[] {
  const startAlt = elevConfig.offset
  let current = Cartesian3.fromDegrees(draft.startLon, draft.startLat, startAlt)
  const positions: Cartesian3[] = [current]

  for (const leg of draft.legs) {
    const distMetres = leg.unit === 'ft' ? leg.distance * 0.3048 : leg.distance
    const bearingRad = CesiumMath.toRadians(leg.bearing)
    // ENU: east = dist * sin(bearing), north = dist * cos(bearing)
    const east = distMetres * Math.sin(bearingRad)
    const north = distMetres * Math.cos(bearingRad)
    current = enuOffsetToWorld(current, 0, east, north, 0)
    positions.push(current)
  }
  return positions
}

export function useTraverseTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  traverseDraft,
  onTraverseDraftChange,
  onFeatureAdded,
}: UseTraverseToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const featureCountRef = useRef(0)

  const removePreview = useCallback(() => {
    if (!viewer) return
    for (const id of [PREVIEW_ID, START_MARKER_ID]) {
      const e = viewer.entities.getById(id)
      if (e) viewer.entities.remove(e)
    }
  }, [viewer])

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    removePreview()
  }, [removePreview])

  // Click handler to set start point
  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'traverse') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      if (traverseDraft) return // start already set
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return
      const [lon, lat] = cartesianToDegrees(pos)
      onTraverseDraftChange({ startLon: lon, startLat: lat, legs: [] })
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanup
  }, [viewer, activeTool, traverseDraft, elevationConfig, onTraverseDraftChange, cleanup])

  // Live preview
  useEffect(() => {
    if (!viewer || activeTool !== 'traverse') {
      removePreview()
      return
    }

    // Start marker
    if (traverseDraft) {
      const startCart = Cartesian3.fromDegrees(
        traverseDraft.startLon,
        traverseDraft.startLat,
        elevationConfig.offset,
      )
      const existing = viewer.entities.getById(START_MARKER_ID)
      if (!existing) {
        viewer.entities.add({
          id: START_MARKER_ID,
          position: startCart,
          point: {
            pixelSize: 8,
            color: Color.fromCssColorString(layerColour),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
          },
        })
      } else {
        (existing as { position: unknown }).position = startCart
      }
    }

    // Polyline preview
    const existingPoly = viewer.entities.getById(PREVIEW_ID)
    if (traverseDraft && traverseDraft.legs.length > 0) {
      computePositions(traverseDraft, elevationConfig)
      if (!existingPoly) {
        viewer.entities.add({
          id: PREVIEW_ID,
          polyline: {
            positions: new CallbackProperty(() => {
              if (!traverseDraft || traverseDraft.legs.length === 0) return []
              return computePositions(traverseDraft, elevationConfig)
            }, false),
            width: 2,
            material: Color.fromCssColorString(layerColour).withAlpha(0.5),
            clampToGround: clampToGroundForDatum(elevationConfig.datum),
          },
        })
      }
    } else if (existingPoly) {
      viewer.entities.remove(existingPoly)
    }
  }, [viewer, activeTool, traverseDraft, elevationConfig, layerColour, removePreview])

  const commitTraverse = useCallback(() => {
    if (!viewer || !traverseDraft || traverseDraft.legs.length === 0) return

    const positions = computePositions(traverseDraft, elevationConfig)
    featureCountRef.current += 1
    const fid = makeFeatureId()
    const entityId = `design_traverse_${fid}`
    const style = styleFromLayerColour(layerColour)
    const colour = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)

    removePreview()

    viewer.entities.add({
      id: entityId,
      polyline: {
        positions,
        width: style.lineWidth,
        material: colour,
        clampToGround: clampToGroundForDatum(elevationConfig.datum),
      },
    })

    const feature: SketchFeature = {
      id: fid,
      label: `Traverse ${featureCountRef.current}`,
      geometry: 'traverse',
      layerId: activeLayerId,
      entityId,
      style,
      elevationConfig,
      attributes: {
        startLon: traverseDraft.startLon,
        startLat: traverseDraft.startLat,
        legs: traverseDraft.legs,
      },
      createdAt: Date.now(),
    }
    onFeatureAdded(feature)
    onTraverseDraftChange(null)
  }, [viewer, traverseDraft, elevationConfig, layerColour, activeLayerId, onFeatureAdded, onTraverseDraftChange, removePreview])

  const clearTraverse = useCallback(() => {
    removePreview()
    onTraverseDraftChange(null)
  }, [removePreview, onTraverseDraftChange])

  return { commitTraverse, clearTraverse }
}
