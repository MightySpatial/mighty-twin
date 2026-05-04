/** Phase I bonus — factorised hook scaffolds for the 8 DT-ported
 *  primitives (Curve, Sphere, Ellipse, PolygonN, Loft, Pipe, Cone,
 *  Extrude). Each follows the same shape as the existing useBoxTool /
 *  useLineTool / useCircleTool hooks: a primary `cleanup`, a
 *  click/drag handler bound to the active tool, and a commit step that
 *  emits a SketchFeature.
 *
 *  Geometry generation is staged — these hooks accept the parameter
 *  payload from the matching panels and emit a feature placeholder
 *  with the right shape. Full Cesium primitive construction (catmull-
 *  rom curve interpolation, parametric pipe tube, lofted surface,
 *  extruded prism) lands as each tool is exercised.
 *
 *  Factored deliberately so a single Vue→React port pass on the geometry
 *  layer doesn't have to also restructure the input pipeline.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer as CesiumViewerType,
} from 'cesium'

import type {
  DesignPrimitive,
  DesignTool,
  ElevationConfig,
  SketchFeature,
} from '../types'
import {
  cartesianToDegrees,
  makeFeatureId,
  pickPosition,
  styleFromLayerColour,
} from './drawUtils'
import type {
  ConeParams,
  CurveParams,
  EllipseParams,
  ExtrudeParams,
  LoftParams,
  PipeParams,
  PolygonNParams,
  SphereParams,
} from './parameters'

// ── Per-primitive parameter union ───────────────────────────────────────

export type PrimitiveParams =
  | { kind: 'curve'; params: CurveParams }
  | { kind: 'sphere'; params: SphereParams }
  | { kind: 'ellipse'; params: EllipseParams }
  | { kind: 'polygonN'; params: PolygonNParams }
  | { kind: 'loft'; params: LoftParams }
  | { kind: 'pipe'; params: PipeParams }
  | { kind: 'cone'; params: ConeParams }
  | { kind: 'extrude'; params: ExtrudeParams }

interface UsePrimitiveToolsOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  /** The active primitive's current parameter payload — mirrors the
   *  matching parameter panel's state. */
  primitiveParams: PrimitiveParams | null
  onFeatureAdded: (feature: SketchFeature) => void
}

/** One hook instead of eight — input handling is identical across all
 *  primitives (single click to place an anchor, primitive params drive
 *  geometry). Each tool just routes the click to the matching commit
 *  function below. Keeps drift between primitives at zero. */
export function usePrimitiveTools({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  primitiveParams,
  onFeatureAdded,
}: UsePrimitiveToolsOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const featureCountRef = useRef(0)

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!viewer || !isPrimitive(activeTool)) {
      cleanup()
      return
    }
    if (!primitiveParams || primitiveParams.kind !== activeTool) {
      // No params yet for the active tool — wait for the panel to
      // flush defaults.
      cleanup()
      return
    }

    const handler = new ScreenSpaceEventHandler(viewer.canvas as HTMLCanvasElement)
    handler.setInputAction((evt: { position: Cartesian2 }) => {
      const cart = pickPosition(viewer, evt.position, elevationConfig)
      if (!cart) return
      const [lon, lat] = cartesianToDegrees(cart)
      featureCountRef.current += 1
      const feature: SketchFeature = {
        id: makeFeatureId(),
        layerId: activeLayerId,
        label: `${activeTool} ${featureCountRef.current}`,
        geometry: 'other',
        // entityId set when the geometry pipeline lands; until then no
        // entity is added to the viewer (we just emit the feature
        // record so attribute / sync pipelines can persist intent).
        entityId: '',
        style: styleFromLayerColour(layerColour),
        elevationConfig,
        attributes: {
          primitive: activeTool as string,
          params: primitiveParams.params as unknown as Record<string, unknown>,
          anchor: { lon, lat },
        },
        createdAt: Date.now(),
      }
      onFeatureAdded(feature)
    }, ScreenSpaceEventType.LEFT_CLICK)
    handlerRef.current = handler
    return cleanup
  }, [
    viewer,
    activeTool,
    primitiveParams,
    activeLayerId,
    layerColour,
    elevationConfig,
    onFeatureAdded,
    cleanup,
  ])

  return { cleanup }
}

// ── Helpers ─────────────────────────────────────────────────────────────

const PRIMITIVES: ReadonlyArray<DesignPrimitive> = [
  'curve',
  'sphere',
  'ellipse',
  'polygonN',
  'loft',
  'pipe',
  'cone',
  'extrude',
]

function isPrimitive(t: DesignTool): t is DesignPrimitive {
  return PRIMITIVES.includes(t as DesignPrimitive)
}
