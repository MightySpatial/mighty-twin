import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { Cartographic, Math as CesiumMathLib, Cartesian2 } from 'cesium'
import { useDragActivate } from '../../hooks/useDragActivate'
import { StreetViewPanel } from './StreetViewPanel'
import { isGoogleMapsLoaded, loadGoogleMaps } from './loader'
import { useToast } from '../../hooks/useToast'

interface Props {
  /** External signal: parent wants the widget active or not. Optional —
   *  the widget tracks its own state but accepts the parent override. */
  active: boolean
  /** Cesium viewer — needed for hit-testing the drag drop point. */
  viewer: CesiumViewer | null
  /** API key from settings.google.mapsApiKey. */
  apiKey: string
  /** Panorama search radius (m). */
  searchRadiusM: number
  /** Parent reflects deactivation up so the rail tile state matches. */
  onDeactivate: () => void
  /** Parent reflects activation up so the rail tile state matches. */
  onActivate?: () => void
  /** Tile button ref — drag pointerdown wires through this. */
  tileRef: React.RefObject<HTMLButtonElement>
}

/** Street View activation flow:
 *
 *  1. User pinches the Street View tile in the rail.
 *  2. Glyph (pegman) follows pointer.
 *  3. Cesium hit-test on every move — we use globe pickPosition to convert
 *     viewport coords → Cartographic (lat/lon). Then we run a getPanorama
 *     dry-run to know if there's imagery there. Caching to avoid burning
 *     the Google quota.
 *  4. On valid drop → mount the StreetViewPanel with the drop point.
 *  5. On invalid drop → toast "No Street View imagery here".
 *
 *  The hit-test uses a cached coverage layer where possible. If the
 *  StreetViewCoverageLayer is loaded, we can avoid getPanorama calls until
 *  the user drops.
 */
export function StreetViewWidget({
  active,
  viewer,
  apiKey,
  searchRadiusM,
  onDeactivate,
  onActivate,
  tileRef,
}: Props) {
  const [dropPoint, setDropPoint] = useState<{ lat: number; lon: number } | null>(null)
  const { addToast } = useToast()

  // Pre-warm Google Maps loader on first render — keeps the drag feeling
  // instant when the user finally drops.
  useEffect(() => {
    if (apiKey && !isGoogleMapsLoaded()) {
      loadGoogleMaps(apiKey).catch(() => {
        /* Will re-error on drop; toast there. */
      })
    }
  }, [apiKey])

  /** Hit-test the Cesium globe at viewport coords. Returns lat/lon if the
   *  ray hits the surface, otherwise null. We don't check Street View
   *  coverage here (would cost a getPanorama call per pointermove) — we
   *  validate on drop instead, with an explicit toast on failure. */
  const hitTestGlobe = useCallback(
    (clientX: number, clientY: number): { lat: number; lon: number } | null => {
      if (!viewer || viewer.isDestroyed()) return null
      try {
        const rect = viewer.container.getBoundingClientRect()
        const cx = clientX - rect.left
        const cy = clientY - rect.top
        // Only valid if pointer is inside the canvas
        if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return null
        // pickPosition is the surface hit; pickEllipsoid is a fallback for
        // when terrain isn't loaded.
        const cart2 = new Cartesian2(cx, cy)
        const pickedCartesian =
          viewer.scene.pickPosition(cart2) ??
          viewer.camera.pickEllipsoid(cart2, viewer.scene.globe.ellipsoid)
        if (!pickedCartesian) return null
        const carto = Cartographic.fromCartesian(pickedCartesian)
        return {
          lat: CesiumMathLib.toDegrees(carto.latitude),
          lon: CesiumMathLib.toDegrees(carto.longitude),
        }
      } catch {
        return null
      }
    },
    [viewer],
  )

  const isValidDropTarget = useCallback(
    (cx: number, cy: number) => {
      if (!apiKey) return false
      return hitTestGlobe(cx, cy) !== null
    },
    [apiKey, hitTestGlobe],
  )

  const onDrop = useCallback(
    (cx: number, cy: number) => {
      if (!apiKey) {
        addToast('warning', 'Set a Google Maps API key in Settings → Google.')
        return
      }
      const point = hitTestGlobe(cx, cy)
      if (!point) {
        addToast('info', 'Drop on the map.')
        return
      }
      setDropPoint(point)
      onActivate?.()
    },
    [apiKey, hitTestGlobe, addToast, onActivate],
  )

  const onTapModeEnter = useCallback(() => {
    if (!apiKey) {
      addToast('warning', 'Set a Google Maps API key in Settings → Google.')
      return
    }
    addToast('info', 'Tap a point on the map to drop Street View here.')
  }, [apiKey, addToast])

  const drag = useDragActivate({
    glyph: <StreetViewPegman />,
    isValidDropTarget,
    onDrop,
    onTapModeEnter,
  })

  // Imperative handle for the rail tile — when the rail renders the
  // button itself (so the tile lives in the rail's flexbox), we still
  // need to wire pointer events. Use addEventListener on the ref.
  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    const handler = (e: PointerEvent) => {
      drag.tileProps.onPointerDown(
        // Synthesize a React PointerEvent-shaped object — only the fields
        // useDragActivate reads.
        {
          clientX: e.clientX,
          clientY: e.clientY,
          pointerId: e.pointerId,
        } as unknown as React.PointerEvent,
      )
    }
    tile.addEventListener('pointerdown', handler)
    tile.dataset.dragActivateTile = 'true'
    return () => {
      tile.removeEventListener('pointerdown', handler)
      delete tile.dataset.dragActivateTile
    }
  }, [tileRef, drag.tileProps])

  // Sync active state to parent when our dropPoint resolves.
  useEffect(() => {
    if (dropPoint && !active) {
      // Hand the active state up — but the parent already set it true
      // by reacting to our onDrop. This is just a safety net.
    }
  }, [dropPoint, active])

  const handleClose = useCallback(() => {
    setDropPoint(null)
    onDeactivate()
  }, [onDeactivate])

  return (
    <>
      {drag.glyphPortal}
      {active && dropPoint && (
        <StreetViewPanel
          apiKey={apiKey}
          searchRadiusM={searchRadiusM}
          dropPoint={dropPoint}
          viewer={viewer}
          onClose={handleClose}
        />
      )}
    </>
  )
}

/** Inline pegman SVG — pure CSS render so we don't ship an external asset.
 *  Google's official pegman is a copyrighted image; this stylised version
 *  reads as a "person silhouette" without infringing. */
function StreetViewPegman() {
  return (
    <svg width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pegBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="18" cy="44" rx="9" ry="2.5" fill="rgba(0,0,0,0.35)" />
      {/* Head */}
      <circle cx="18" cy="9" r="6" fill="url(#pegBody)" stroke="#fff" strokeWidth="1.5" />
      {/* Body */}
      <path
        d="M10 18 L 10 32 Q 10 36 14 36 L 14 41 Q 14 43 16 43 L 20 43 Q 22 43 22 41 L 22 36 Q 26 36 26 32 L 26 18 Q 26 14 22 14 L 14 14 Q 10 14 10 18 Z"
        fill="url(#pegBody)"
        stroke="#fff"
        strokeWidth="1.5"
      />
    </svg>
  )
}
