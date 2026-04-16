/**
 * useSitePinDistances
 *
 * Live camera-to-pin distance metric for all tracked site pins.
 * Returns a ref { [pinId]: metres }, updated while camera is moving (~5fps via postRender).
 * Zero overhead when camera is still.
 *
 * Any future tool (proximity alerts, LOD, contextual UI) can read this ref.
 *
 * Usage:
 *   const pinPositions = { 'site-slug': Cartesian3 }  // terrain-accurate positions
 *   const distances = useSitePinDistances(viewerRef, pinPositions)
 *   // distances.current['site-slug'] => metres
 */
import { useEffect, useRef } from 'react'
import { Viewer as CesiumViewer, Cartesian3 } from 'cesium'

const THROTTLE_MS = 200 // ~5fps

export function useSitePinDistances(
  viewerRef: React.RefObject<CesiumViewer | null>,
  pinPositions: Record<string, Cartesian3>,
): React.MutableRefObject<Record<string, number>> {
  const distancesRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || Object.keys(pinPositions).length === 0) return

    let isMoving = false
    let lastUpdate = 0

    function updateDistances() {
      const now = performance.now()
      if (now - lastUpdate < THROTTLE_MS) return
      lastUpdate = now
      const camPos = viewer!.camera.positionWC
      const updated: Record<string, number> = {}
      for (const [id, pos] of Object.entries(pinPositions)) {
        updated[id] = Cartesian3.distance(camPos, pos)
      }
      distancesRef.current = updated
    }

    const onMoveStart = () => { isMoving = true }
    const onMoveEnd = () => { isMoving = false; updateDistances() }
    const onPostRender = () => { if (isMoving) updateDistances() }

    viewer.camera.moveStart.addEventListener(onMoveStart)
    viewer.camera.moveEnd.addEventListener(onMoveEnd)
    viewer.scene.postRender.addEventListener(onPostRender)
    updateDistances()

    return () => {
      viewer.camera.moveStart.removeEventListener(onMoveStart)
      viewer.camera.moveEnd.removeEventListener(onMoveEnd)
      viewer.scene.postRender.removeEventListener(onPostRender)
    }
  }, [viewerRef, pinPositions])

  return distancesRef
}
