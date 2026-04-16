/**
 * MightyTwin — Line Draw Tool
 * Click to add vertices. Double-click or Enter to finish.
 * Shows a live preview polyline while drawing.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import {
  Viewer as CesiumViewerType,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Color,
  CallbackProperty,
} from 'cesium'
import type { DesignTool, ElevationConfig, SketchFeature } from '../types'
import { pickPosition, makeFeatureId, styleFromLayerColour, clampToGroundForDatum } from './drawUtils'

const PREVIEW_ID = '__line_preview__'

interface UseLineToolOpts {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  activeLayerId: string
  layerColour: string
  onFeatureAdded: (feature: SketchFeature) => void
}

export function useLineTool({
  viewer,
  activeTool,
  elevationConfig,
  activeLayerId,
  layerColour,
  onFeatureAdded,
}: UseLineToolOpts) {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const positionsRef = useRef<Cartesian3[]>([])
  const cursorRef = useRef<Cartesian3 | null>(null)
  const featureCountRef = useRef(0)
  const lastClickPosRef = useRef<Cartesian2 | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const secondClickSkippedRef = useRef(false)
  const [vertexCount, setVertexCount] = useState(0)

  const removePreview = useCallback(() => {
    if (!viewer) return
    const existing = viewer.entities.getById(PREVIEW_ID)
    if (existing) viewer.entities.remove(existing)
  }, [viewer])

  const completeLine = useCallback(() => {
    if (!viewer || positionsRef.current.length < 2) return

    // Defensive: drop trailing vertex if it duplicates the previous one
    // (can happen when the timing-based double-click guard misses)
    const pts = positionsRef.current
    if (pts.length >= 2) {
      const last = pts[pts.length - 1]
      const prev = pts[pts.length - 2]
      if (Cartesian3.equalsEpsilon(last, prev, 0, 1.0)) {
        pts.pop()
      }
    }
    if (pts.length < 2) return

    featureCountRef.current += 1
    const fid = makeFeatureId()
    const entityId = `design_line_${fid}`
    const style = styleFromLayerColour(layerColour)
    const colour = Color.fromCssColorString(style.strokeColor).withAlpha(style.opacity)
    const positions = [...positionsRef.current]

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
      label: `Line ${featureCountRef.current}`,
      geometry: 'line',
      layerId: activeLayerId,
      entityId,
      style,
      elevationConfig,
      attributes: {},
      createdAt: Date.now(),
    }
    onFeatureAdded(feature)
    positionsRef.current = []
    cursorRef.current = null
    lastClickPosRef.current = null
    lastClickTimeRef.current = 0
    secondClickSkippedRef.current = false
    setVertexCount(0)
  }, [viewer, layerColour, elevationConfig, activeLayerId, onFeatureAdded, removePreview])

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }
    removePreview()
    positionsRef.current = []
    cursorRef.current = null
    lastClickPosRef.current = null
    lastClickTimeRef.current = 0
    secondClickSkippedRef.current = false
    setVertexCount(0)
  }, [removePreview])

  useEffect(() => {
    cleanup()
    if (!viewer || activeTool !== 'line') return

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    // Live preview
    const previewColour = Color.fromCssColorString(layerColour).withAlpha(0.5)
    viewer.entities.add({
      id: PREVIEW_ID,
      polyline: {
        positions: new CallbackProperty(() => {
          const pts = [...positionsRef.current]
          if (cursorRef.current) pts.push(cursorRef.current)
          return pts.length >= 2 ? pts : []
        }, false),
        width: 2,
        material: previewColour,
        clampToGround: clampToGroundForDatum(elevationConfig.datum),
      },
    })

    handler.setInputAction((click: { position: Cartesian2 }) => {
      const now = Date.now()
      if (
        lastClickTimeRef.current &&
        now - lastClickTimeRef.current < 400 &&
        lastClickPosRef.current &&
        Cartesian2.distance(click.position, lastClickPosRef.current) < 5
      ) {
        // This is the second click of a double-click — skip adding a vertex.
        // Flag it so the double-click handler knows not to pop either.
        secondClickSkippedRef.current = true
        return
      }
      secondClickSkippedRef.current = false
      lastClickPosRef.current = Cartesian2.clone(click.position)
      lastClickTimeRef.current = now

      const pos = pickPosition(viewer, click.position, elevationConfig)
      if (pos) {
        positionsRef.current.push(pos)
        setVertexCount(positionsRef.current.length)
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((move: { endPosition: Cartesian2 }) => {
      const pos = pickPosition(viewer, move.endPosition, elevationConfig)
      cursorRef.current = pos
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction((click: { position: Cartesian2 }) => {
      // If the timing guard in LEFT_CLICK already skipped the second click,
      // no duplicate vertex was added — go straight to commit.
      // Otherwise the second click slipped through and added a near-duplicate
      // vertex — pop it before committing.
      if (!secondClickSkippedRef.current) {
        const pts = positionsRef.current
        if (
          pts.length >= 2 &&
          lastClickPosRef.current &&
          Cartesian2.distance(click.position, lastClickPosRef.current) < 5
        ) {
          pts.pop()
          setVertexCount(pts.length)
        }
      }
      secondClickSkippedRef.current = false
      completeLine()
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    // Enter key to finish
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') completeLine()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cleanup()
    }
  }, [viewer, activeTool, elevationConfig, activeLayerId, layerColour, onFeatureAdded, cleanup, completeLine])

  return { vertexCount }
}
