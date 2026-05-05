/** useFeatureClick — left-click feature picker + popup state.
 *
 *  Mounts a Cesium ScreenSpaceEventHandler that fires on LEFT_CLICK,
 *  picks the topmost entity under the cursor, and exposes:
 *    - the picked feature (entity reference + attribute bag)
 *    - the cursor screen position (for the leader-line popup anchor)
 *    - a `clear()` function to dismiss
 *
 *  Tracks the entity through camera moves so the popup follows
 *  the underlying feature on the canvas.
 *
 *  Returns null `picked` when no feature is under the cursor — the
 *  default Cesium info box is suppressed (selectionIndicator off in
 *  CesiumViewer mount), so this is the single feature-click surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Cartesian2,
  Cartesian3,
  type Entity,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
  JulianDate,
} from 'cesium'

export interface PickedFeature {
  /** Entity id (Cesium-assigned UUID or the data source's id). */
  id: string
  /** Display name; falls back to entity name or id. */
  name: string
  /** Attributes flattened from entity.properties.getValue(). */
  attributes: Record<string, unknown>
  /** Source label (e.g. layer id or 'sketch') if discoverable. */
  source: string | null
  /** Live entity ref — used for follow-the-feature recompute. */
  entity: Entity
}

export interface ScreenAnchor {
  /** Screen-space pixel coords (x = left, y = top) where the popup leader points. */
  x: number
  y: number
  /** Whether the anchor is on screen (false ⇒ feature behind the camera or off-canvas). */
  visible: boolean
}

interface FeatureClickState {
  picked: PickedFeature | null
  anchor: ScreenAnchor | null
  clear: () => void
}

const NULL_STATE: FeatureClickState = {
  picked: null,
  anchor: null,
  clear: () => undefined,
}

export function useFeatureClick(viewerRef: React.MutableRefObject<Viewer | null>): FeatureClickState {
  const [picked, setPicked] = useState<PickedFeature | null>(null)
  const [anchor, setAnchor] = useState<ScreenAnchor | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const positionRef = useRef<Cartesian3 | null>(null)

  const clear = useCallback(() => {
    setPicked(null)
    setAnchor(null)
    positionRef.current = null
  }, [])

  // Mount the click handler once the viewer is ready. We re-establish
  // it whenever viewerRef.current flips (mount / remount on breakpoint).
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    let scene
    try {
      scene = viewer.scene
    } catch {
      return
    }
    if (!scene) return

    const handler = new ScreenSpaceEventHandler(scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      try {
        const hit = scene.pick(click.position) as { id?: Entity } | undefined
        if (!hit || !hit.id || !(hit.id as Entity).position) {
          // Click on globe — dismiss any open popup.
          clear()
          return
        }
        const entity = hit.id as Entity
        const props = entity.properties?.getValue(JulianDate.now()) as
          | Record<string, unknown>
          | undefined
        const attrs = props ?? {}
        const name =
          (typeof attrs.name === 'string' && attrs.name) ||
          (typeof attrs.NAME === 'string' && attrs.NAME) ||
          entity.name ||
          entity.id ||
          'Feature'
        const source =
          (typeof attrs.layer === 'string' && attrs.layer) ||
          (typeof attrs.layer_id === 'string' && attrs.layer_id) ||
          (typeof attrs.source === 'string' && attrs.source) ||
          null
        setPicked({
          id: String(entity.id ?? Date.now()),
          name: String(name),
          attributes: attrs,
          source,
          entity,
        })
        const pos = entity.position?.getValue(JulianDate.now()) ?? null
        positionRef.current = pos as Cartesian3 | null
      } catch {
        clear()
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      try {
        handler.destroy()
      } catch {
        /* viewer already torn down */
      }
      handlerRef.current = null
    }
  }, [viewerRef.current, clear])

  // Follow the entity through camera movements so the leader stays
  // anchored. postRender fires every frame Cesium re-renders, which is
  // already throttled for us — we just project the cached world position.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let scene
    try {
      scene = viewer.scene
    } catch {
      return
    }
    if (!scene) return

    const onPost = () => {
      if (!positionRef.current) return
      try {
        const win = scene.cartesianToCanvasCoordinates(positionRef.current)
        if (!win) {
          setAnchor((prev) => (prev?.visible ? { ...prev, visible: false } : prev))
          return
        }
        // Detect "behind the camera" — Cesium returns the projected
        // point even when occluded by the globe; for a basic leader
        // line that's good enough.
        setAnchor({ x: win.x, y: win.y, visible: true })
      } catch {
        /* viewer destroyed mid-frame */
      }
    }
    scene.postRender.addEventListener(onPost)
    return () => {
      try {
        scene.postRender.removeEventListener(onPost)
      } catch {
        /* scene disposed */
      }
    }
  }, [viewerRef.current, picked?.id])

  if (!picked) return NULL_STATE
  return { picked, anchor, clear }
}
