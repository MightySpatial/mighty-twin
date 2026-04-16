/**
 * MightyTwin — Solid Placement Tools (Box / Pit / Cylinder)
 * Draft-based workflow: click → draft → live preview → confirm/cancel.
 * Ported from v1 cadRenderer.js renderBox/renderCylinder/renderPit.
 */
import { useEffect, useRef, useCallback } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
} from 'cesium'
import type {
  DesignTool,
  ElevationConfig,
  SketchFeature,
  BoxDraft,
  PitDraft,
  CylDraft,
  SolidTool,
  SolidDraft,
} from '../types'
import {
  pickPosition,
  makeFeatureId,
  styleFromLayerColour,
  cartesianToDegrees,
  enuOffsetToWorld,
} from './drawUtils'
import { commitBox, commitCylinder, commitPit } from './solidCommit'

const PREVIEW_ID = '__solid_draft_preview__'

function isSolidTool(tool: DesignTool): tool is SolidTool {
  return tool === 'box' || tool === 'pit' || tool === 'cylinder'
}

interface UseSolidToolsOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  solidDraft: SolidDraft | null
  onSolidDraftChange: (draft: SolidDraft | null) => void
  onFeatureAdded: (feature: SketchFeature) => void
}

// ─── Default drafts ──────────────────────────────────────────────────────────

function defaultBoxDraft(lon: number, lat: number, alt: number, scale = 20): BoxDraft {
  const s = Math.round(scale)
  return { lon, lat, alt, width: s, height: Math.round(s * 0.5), depth: s, heading: 0, wallThickness: 0, shape: 'square' }
}

function defaultPitDraft(lon: number, lat: number, alt: number, scale = 10): PitDraft {
  const s = Math.round(scale)
  const wall = Math.max(0.5, Math.round(s * 0.25))
  return { lon, lat, alt, width: s, depth: s, height: Math.round(s * 0.8), heading: 0, wallThickness: wall, floorThickness: Math.max(0.3, wall * 0.5), shape: 'square', radius: Math.round(s * 0.5) }
}

function defaultCylDraft(lon: number, lat: number, alt: number, scale = 10): CylDraft {
  const r = Math.round(scale * 0.5)
  return { lon, lat, alt, radius: r, height: Math.round(r * 1.5), heading: 0, pitch: 0, roll: 0, wallThickness: 0 }
}

// ─── Preview rendering (simplified outer shell only) ─────────────────────────

function removeAllPreview(viewer: CesiumViewerType) {
  const toRemove: string[] = []
  const entities = viewer.entities.values
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].id.startsWith(PREVIEW_ID)) toRemove.push(entities[i].id)
  }
  for (const id of toRemove) {
    const e = viewer.entities.getById(id)
    if (e) viewer.entities.remove(e)
  }
}

function renderPreview(viewer: CesiumViewerType, draft: SolidDraft, tool: SolidTool, colour: string) {
  removeAllPreview(viewer)

  const fill = Color.fromCssColorString(colour).withAlpha(0.75)
  const outline = Color.fromCssColorString(colour).withAlpha(1.0)

  if (tool === 'box') {
    const d = draft as BoxDraft
    const center = Cartesian3.fromDegrees(d.lon, d.lat, d.alt + d.height / 2)
    const hpr = new HeadingPitchRoll(CesiumMath.toRadians(d.heading), 0, 0)
    const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
    viewer.entities.add({
      id: PREVIEW_ID,
      position: center,
      orientation: new ConstantProperty(orientation),
      box: {
        dimensions: new Cartesian3(d.width, d.depth, d.height),
        material: new ColorMaterialProperty(fill),
        fill: true,
        outline: true,
        outlineColor: outline,
      },
    })
  } else if (tool === 'cylinder') {
    const d = draft as CylDraft
    const center = Cartesian3.fromDegrees(d.lon, d.lat, d.alt + d.height / 2)
    const hpr = new HeadingPitchRoll(
      CesiumMath.toRadians(d.heading),
      CesiumMath.toRadians(d.pitch),
      CesiumMath.toRadians(d.roll),
    )
    const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
    viewer.entities.add({
      id: PREVIEW_ID,
      position: center,
      orientation: new ConstantProperty(orientation),
      cylinder: {
        length: d.height,
        topRadius: d.radius,
        bottomRadius: d.radius,
        material: new ColorMaterialProperty(fill),
        fill: true,
        outline: true,
        outlineColor: outline,
        numberOfVerticalLines: 36,
      },
    })
  } else if (tool === 'pit') {
    const d = draft as PitDraft
    if (d.shape === 'round') {
      const center = Cartesian3.fromDegrees(d.lon, d.lat, d.alt + d.height / 2)
      const hpr = new HeadingPitchRoll(CesiumMath.toRadians(d.heading), 0, 0)
      const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
      viewer.entities.add({
        id: PREVIEW_ID,
        position: center,
        orientation: new ConstantProperty(orientation),
        cylinder: {
          length: d.height,
          topRadius: d.radius,
          bottomRadius: d.radius,
          material: new ColorMaterialProperty(fill),
          fill: true,
          outline: true,
          outlineColor: outline,
          numberOfVerticalLines: 36,
        },
      })
    } else {
      // Render 4 separate wall entities so the hollow centre is visible from above
      const baseCart = Cartesian3.fromDegrees(d.lon, d.lat, d.alt)
      const headingRad = CesiumMath.toRadians(d.heading)
      const t = d.wallThickness > 0 ? d.wallThickness : d.width * 0.2
      const hw = d.width / 2
      const hd = d.depth / 2
      const hh = d.height / 2
      const innerD = Math.max(0.01, d.depth - t * 2)

      const wallPanels: [string, number, number, number, number][] = [
        ['_n', 0, hd - t / 2, d.width, t],
        ['_s', 0, -(hd - t / 2), d.width, t],
        ['_e', hw - t / 2, 0, t, innerD],
        ['_w', -(hw - t / 2), 0, t, innerD],
      ]

      for (const [suffix, eOff, nOff, bw, bd] of wallPanels) {
        const center = enuOffsetToWorld(baseCart, headingRad, eOff, nOff, hh)
        const hpr = new HeadingPitchRoll(headingRad, 0, 0)
        const orientation = Transforms.headingPitchRollQuaternion(center, hpr)
        viewer.entities.add({
          id: PREVIEW_ID + suffix,
          position: center,
          orientation: new ConstantProperty(orientation),
          box: {
            dimensions: new Cartesian3(bw, bd, d.height),
            material: new ColorMaterialProperty(fill),
            fill: true,
            outline: true,
            outlineColor: outline,
          },
        })
      }
    }
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const featureCounters: Record<SolidTool, number> = { box: 0, pit: 0, cylinder: 0 }

export function useSolidTools({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  solidDraft,
  onSolidDraftChange,
  onFeatureAdded,
}: UseSolidToolsOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  const cleanupHandler = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
  }, [])

  // ── Click handler: create draft on globe click ──────────────────────────
  useEffect(() => {
    cleanupHandler()
    if (!viewer || !isSolidTool(activeTool)) return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (!pos) return

      const [lon, lat, alt] = cartesianToDegrees(pos)

      // Scale default size to ~5% of camera height so it's always visible
      const camH = viewer.camera.positionCartographic.height
      const scale = Math.max(1, camH * 0.05)

      let draft: SolidDraft
      if (activeTool === 'box') draft = defaultBoxDraft(lon, lat, alt, scale)
      else if (activeTool === 'pit') draft = defaultPitDraft(lon, lat, alt, scale)
      else draft = defaultCylDraft(lon, lat, alt, scale)

      onSolidDraftChange(draft)
    }, ScreenSpaceEventType.LEFT_CLICK)

    return cleanupHandler
  }, [viewer, activeTool, elevationConfig, onSolidDraftChange, cleanupHandler])

  // ── Live preview: update whenever solidDraft changes ────────────────────
  useEffect(() => {
    if (!viewer) return
    if (!solidDraft || !isSolidTool(activeTool)) {
      removeAllPreview(viewer)
      return
    }
    renderPreview(viewer, solidDraft, activeTool, layerColour)
  }, [viewer, solidDraft, activeTool, layerColour])

  // ── Cleanup preview on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (viewer) removeAllPreview(viewer)
    }
  }, [viewer])

  // ── Confirm: commit full geometry, register feature ─────────────────────
  const confirmSolidPlacement = useCallback(() => {
    if (!viewer || !solidDraft || !isSolidTool(activeTool)) return

    removeAllPreview(viewer)

    const tool = activeTool
    featureCounters[tool] += 1
    const fid = makeFeatureId()
    const entityId = `design_${tool}_${fid}`
    const style = styleFromLayerColour(layerColour)
    const fillCol = Color.fromCssColorString(style.fillColor).withAlpha(style.opacity * 0.65)
    const outlineCol = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)

    if (tool === 'box') commitBox(viewer, solidDraft as BoxDraft, entityId, fillCol, outlineCol)
    else if (tool === 'cylinder') commitCylinder(viewer, solidDraft as CylDraft, entityId, fillCol, outlineCol)
    else if (tool === 'pit') {
      const pitFill = Color.fromCssColorString(style.fillColor).withAlpha(0.85)
      commitPit(viewer, solidDraft as PitDraft, entityId, pitFill, outlineCol)
    }

    const labelMap: Record<SolidTool, string> = { box: 'Box', pit: 'Pit', cylinder: 'Cylinder' }
    const feature: SketchFeature = {
      id: fid,
      label: `${labelMap[tool]} ${featureCounters[tool]}`,
      geometry: tool,
      layerId: activeLayerId,
      entityId,
      style,
      elevationConfig,
      attributes: {},
      solidParams: { ...solidDraft },
      createdAt: Date.now(),
    }
    onFeatureAdded(feature)
    onSolidDraftChange(null)
  }, [viewer, solidDraft, activeTool, activeLayerId, layerColour, elevationConfig, onFeatureAdded, onSolidDraftChange])

  // ── Cancel: remove preview, clear draft ─────────────────────────────────
  const cancelSolidDraft = useCallback(() => {
    if (viewer) removeAllPreview(viewer)
    onSolidDraftChange(null)
  }, [viewer, onSolidDraftChange])

  return { confirmSolidPlacement, cancelSolidDraft }
}
