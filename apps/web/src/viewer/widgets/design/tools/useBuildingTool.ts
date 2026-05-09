/**
 * Building wizard tool — places a stack of floor slabs at a click point.
 *
 * Each floor lands as its own Cesium box entity, so the user gets one
 * SketchFeature per floor in the History panel and can tweak / delete
 * individual floors after placement. The first floor is labelled
 * "Ground", subsequent floors are "Level 1", "Level 2", … and the
 * roof slab gets its own "Roof" feature.
 *
 * Wall thickness > 0 produces hollow shells (six panels per floor) by
 * deferring to the same hollow-rendering branch ``useBoxTool`` uses, so
 * a building generated from this wizard renders identically to one
 * placed by hand.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
} from 'cesium'
import type {
  BuildingDraft,
  DesignTool,
  ElevationConfig,
  SketchFeature,
  SketchLayer,
} from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  cartesianToDegrees,
  addBoxEntity,
  enuOffsetToWorld,
} from './drawUtils'

interface UseBuildingToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  draft: BuildingDraft
  layers: SketchLayer[]
  /** Active layer fallback when an archetype-named layer doesn't exist. */
  activeLayerId: string
  onFeatureAdded: (feature: SketchFeature) => void
  /** Optional callback after the building lands so the host can clear
   *  the active tool back to ``select``. */
  onPlaced?: () => void
}

/** Pick a layer whose name matches one of the candidate strings (case
 *  insensitive). Returns the first match or undefined. Used to land
 *  Ground / Level / Roof / Site Context boxes onto the right preset
 *  layer so a user starting from "Building Design" gets a tidy
 *  history panel. */
function findLayerByName(
  layers: SketchLayer[],
  candidates: string[],
): SketchLayer | undefined {
  const lc = layers.map((l) => ({ l, n: l.name.toLowerCase() }))
  for (const cand of candidates) {
    const c = cand.toLowerCase()
    const hit = lc.find(({ n }) => n.includes(c))
    if (hit) return hit.l
  }
  return undefined
}

export function useBuildingTool({
  viewer,
  activeTool,
  elevationConfig,
  draft,
  layers,
  activeLayerId,
  onFeatureAdded,
  onPlaced,
}: UseBuildingToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  // Latest draft + onFeatureAdded captured in refs so the click handler
  // can read them without re-subscribing on every keystroke in the
  // wizard form.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const layersRef = useRef(layers)
  layersRef.current = layers
  const activeLayerIdRef = useRef(activeLayerId)
  activeLayerIdRef.current = activeLayerId
  const onAddedRef = useRef(onFeatureAdded)
  onAddedRef.current = onFeatureAdded
  const onPlacedRef = useRef(onPlaced)
  onPlacedRef.current = onPlaced

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
  }, [])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'building') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return
      const [lon, lat, alt] = cartesianToDegrees(pos)
      const d = draftRef.current
      const ls = layersRef.current
      const fallbackLayer = activeLayerIdRef.current

      const groundLayer = findLayerByName(ls, ['ground floor', 'ground'])?.id
        ?? fallbackLayer
      const upperLayer = findLayerByName(ls, ['first floor', 'upper', 'level'])?.id
        ?? groundLayer
      const roofLayer = findLayerByName(ls, ['roof'])?.id ?? upperLayer
      const siteLayer = findLayerByName(ls, ['site context', 'site'])?.id
        ?? fallbackLayer

      const headingRad = CesiumMath.toRadians(d.heading)
      const baseCart = Cartesian3.fromDegrees(lon, lat, alt)
      const isHollow = d.wallThickness > 0
        && d.wallThickness < Math.min(d.width, d.depth, d.floorHeight) / 2

      const buildingId = makeFeatureId()

      // Optional Site Context — a thin slab at the footprint extents,
      // 0.05m thick so it doesn't fight the floor slab visually but
      // still gives the building a visible "shadow" on the ground.
      if (d.includeSiteContext) {
        const siteLayerObj = ls.find((l) => l.id === siteLayer)
        const siteStyle = styleFromLayerColour(siteLayerObj?.colour ?? '#84cc16')
        const siteFill = Color.fromCssColorString(siteStyle.fillColor).withAlpha(
          siteStyle.opacity * 0.5,
        )
        const siteOutline = Color.fromCssColorString(siteStyle.strokeColor).withAlpha(
          siteStyle.opacity,
        )
        const siteCenter = Cartesian3.fromDegrees(lon, lat, alt + 0.025)
        const siteEntityId = `design_building_site_${buildingId}`
        addBoxEntity(
          viewer,
          siteEntityId,
          siteCenter,
          headingRad,
          d.width + 2,
          d.depth + 2,
          0.05,
          siteFill,
          siteOutline,
        )
        onAddedRef.current({
          id: `${buildingId}_site`,
          label: 'Site context',
          geometry: 'building',
          layerId: siteLayer,
          entityId: siteEntityId,
          style: siteStyle,
          elevationConfig,
          attributes: { ...d, role: 'site_context' },
          solidParams: { width: d.width + 2, depth: d.depth + 2, thickness: 0.05 },
          createdAt: Date.now(),
        })
      }

      // Stack of floor slabs.
      for (let i = 0; i < d.floors; i++) {
        const targetLayerId = i === 0 ? groundLayer : upperLayer
        const targetLayer = ls.find((l) => l.id === targetLayerId)
        const style = styleFromLayerColour(targetLayer?.colour ?? '#6366f1')
        const fillCol = Color.fromCssColorString(style.fillColor).withAlpha(
          style.opacity * 0.55,
        )
        const outlineCol = Color.fromCssColorString(style.strokeColor).withAlpha(
          style.opacity,
        )
        const floorBaseAlt = alt + i * d.floorHeight
        const fid = `${buildingId}_f${i}`
        const label = i === 0 ? 'Ground' : `Level ${i}`

        if (!isHollow) {
          const center = Cartesian3.fromDegrees(
            lon,
            lat,
            floorBaseAlt + d.floorHeight / 2,
          )
          const entityId = `design_building_${fid}`
          addBoxEntity(
            viewer,
            entityId,
            center,
            headingRad,
            d.width,
            d.depth,
            d.floorHeight,
            fillCol,
            outlineCol,
          )
          onAddedRef.current({
            id: fid,
            label,
            geometry: 'building',
            layerId: targetLayerId,
            entityId,
            style,
            elevationConfig,
            attributes: { ...d, floor_index: i, role: 'floor' },
            solidParams: {
              width: d.width,
              depth: d.depth,
              height: d.floorHeight,
              floor_index: i,
            },
            createdAt: Date.now(),
          })
        } else {
          // Hollow per-floor: 6 panels stacked exactly like the box tool's
          // hollow branch but per-floor so each level is independently
          // selectable.
          const baseEntityId = `design_building_${fid}`
          const t = d.wallThickness
          const hw = d.width / 2
          const hd = d.depth / 2
          const hh = d.floorHeight / 2
          const innerD = Math.max(0.01, d.depth - t * 2)
          const innerH = Math.max(0.01, d.floorHeight - t * 2)
          const floorBase = Cartesian3.fromDegrees(lon, lat, floorBaseAlt)
          const panels: [string, number, number, number, number, number, number][] = [
            ['_n', 0, hd - t / 2, hh, d.width, t, innerH],
            ['_s', 0, -(hd - t / 2), hh, d.width, t, innerH],
            ['_e', hw - t / 2, 0, hh, t, innerD, innerH],
            ['_w', -(hw - t / 2), 0, hh, t, innerD, innerH],
            ['_top', 0, 0, d.floorHeight - t / 2, d.width, d.depth, t],
            ['_bot', 0, 0, t / 2, d.width, d.depth, t],
          ]
          for (const [suffix, e, n, u, bw, bd, bh] of panels) {
            const center = enuOffsetToWorld(floorBase, headingRad, e, n, u)
            addBoxEntity(
              viewer,
              baseEntityId + suffix,
              center,
              headingRad,
              bw,
              bd,
              bh,
              fillCol,
              outlineCol,
            )
          }
          onAddedRef.current({
            id: fid,
            label,
            geometry: 'building',
            layerId: targetLayerId,
            entityId: baseEntityId,
            style,
            elevationConfig,
            attributes: { ...d, floor_index: i, role: 'floor' },
            solidParams: {
              width: d.width,
              depth: d.depth,
              height: d.floorHeight,
              wallThickness: t,
              floor_index: i,
            },
            createdAt: Date.now(),
          })
        }
      }

      // Roof slab on top.
      const roofLayerObj = ls.find((l) => l.id === roofLayer)
      const roofStyle = styleFromLayerColour(roofLayerObj?.colour ?? '#ef4444')
      const roofFill = Color.fromCssColorString(roofStyle.fillColor).withAlpha(
        roofStyle.opacity * 0.55,
      )
      const roofOutline = Color.fromCssColorString(roofStyle.strokeColor).withAlpha(
        roofStyle.opacity,
      )
      const roofBaseAlt = alt + d.floors * d.floorHeight
      const roofCenter = Cartesian3.fromDegrees(
        lon,
        lat,
        roofBaseAlt + d.roofThickness / 2,
      )
      const roofEntityId = `design_building_roof_${buildingId}`
      addBoxEntity(
        viewer,
        roofEntityId,
        roofCenter,
        headingRad,
        d.width,
        d.depth,
        d.roofThickness,
        roofFill,
        roofOutline,
      )
      onAddedRef.current({
        id: `${buildingId}_roof`,
        label: 'Roof',
        geometry: 'building',
        layerId: roofLayer,
        entityId: roofEntityId,
        style: roofStyle,
        elevationConfig,
        attributes: { ...d, role: 'roof' },
        solidParams: {
          width: d.width,
          depth: d.depth,
          height: d.roofThickness,
        },
        createdAt: Date.now(),
      })

      // Hand control back so the user doesn't accidentally place a
      // second building on the next click. The wizard panel listens to
      // this to reset the tool and update its state.
      onPlacedRef.current?.()
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanup
  }, [viewer, activeTool, elevationConfig, cleanup])
}
