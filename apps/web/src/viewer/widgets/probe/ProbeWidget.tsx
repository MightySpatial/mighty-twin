import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { Cartographic, Math as CesiumMathLib, Cartesian2 } from 'cesium'
import { useDragActivate } from '../../hooks/useDragActivate'
import { useToast } from '../../hooks/useToast'
import { ProbeGlyph } from './ProbeGlyph'
import { ProbeOverlay } from './ProbeOverlay'
import { ProbeMapLayer } from './ProbeMapLayer'
import { ProbeTileset } from './ProbeTileset'
import { ProbeJunctionArrows } from './ProbeJunctionArrows'
import { useProbe, type ProbeState } from './useProbe'
import { listSpaces, seedDemoSpaces } from './registry'
import type { NavigableSpace } from './types'

interface Props {
  /** Viewer reference. */
  viewer: CesiumViewer | null
  /** Site slug for scoping the NavigableSpace registry. */
  siteSlug: string | null
  /** Tile button element reference — drag pointerdown wires to this. */
  tileRef: React.RefObject<HTMLButtonElement>
  /** When true, the parent rail is active for the Probe tile. */
  active: boolean
  /** Parent reflects probe activation state up. */
  onActiveChange: (active: boolean) => void
  /** Default damp threshold (m) from settings. */
  dampThresholdM: number
  /** Re-export the current probe state so parents can pipe it to Fly etc. */
  onStateChange?: (state: ProbeState) => void
}

/** ProbeWidget — orchestrates drag-to-activate, hit-testing the map for
 *  navigable features, activating the probe, and rendering the overlay.
 *
 *  The hit-test logic:
 *  1. During drag, on every pointermove we use Cesium scene.pick to
 *     identify the entity under the cursor.
 *  2. If the entity has a NavigableSpace association, the drop is valid.
 *  3. For v1, since the demo seeds a "Demo pipe" near the site centroid,
 *     we also accept dropping anywhere within the bounding box of any
 *     known NavigableSpace as a valid drop (gives slack for the user).
 */
export function ProbeWidget({
  viewer, siteSlug, tileRef, active, onActiveChange, dampThresholdM, onStateChange,
}: Props) {
  const { addToast } = useToast()
  const probe = useProbe(viewer)
  const [spacesVersion, setSpacesVersion] = useState(0)

  // Apply damp threshold from settings
  useEffect(() => {
    probe.setDampThreshold(dampThresholdM)
  }, [dampThresholdM, probe])

  // Seed demo spaces once per site
  useEffect(() => {
    if (!siteSlug || !viewer || viewer.isDestroyed()) return
    try {
      const carto = Cartographic.fromCartesian(viewer.camera.position)
      seedDemoSpaces(siteSlug, {
        lon: CesiumMathLib.toDegrees(carto.longitude),
        lat: CesiumMathLib.toDegrees(carto.latitude),
        h: Math.max(carto.height, 0),
      })
      setSpacesVersion((n) => n + 1)
    } catch {
      /* viewer not ready, retry on next render */
    }
  }, [siteSlug, viewer])

  // Refresh on registry-change events
  useEffect(() => {
    const onChange = () => setSpacesVersion((n) => n + 1)
    window.addEventListener('probe-registry-change', onChange)
    return () => window.removeEventListener('probe-registry-change', onChange)
  }, [])

  const spaces = useMemo(() => {
    if (!siteSlug) return [] as NavigableSpace[]
    return listSpaces(siteSlug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSlug, spacesVersion])

  /** Convert client (x, y) to geographic lon/lat via Cesium pickPosition. */
  const hitGlobeToLonLat = useCallback(
    (clientX: number, clientY: number): { lon: number; lat: number } | null => {
      if (!viewer || viewer.isDestroyed()) return null
      try {
        const rect = viewer.container.getBoundingClientRect()
        const cx = clientX - rect.left
        const cy = clientY - rect.top
        if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return null
        const cart2 = new Cartesian2(cx, cy)
        const pos =
          viewer.scene.pickPosition(cart2) ??
          viewer.camera.pickEllipsoid(cart2, viewer.scene.globe.ellipsoid)
        if (!pos) return null
        const c = Cartographic.fromCartesian(pos)
        return {
          lon: CesiumMathLib.toDegrees(c.longitude),
          lat: CesiumMathLib.toDegrees(c.latitude),
        }
      } catch {
        return null
      }
    },
    [viewer],
  )

  /** Find the nearest NavigableSpace to a geographic point, within an
   *  acceptance radius. Returns the candidate space + the actual drop
   *  point, or null. */
  const findNearestSpace = useCallback(
    (lon: number, lat: number): { space: NavigableSpace; dropLon: number; dropLat: number } | null => {
      if (spaces.length === 0) return null

      // For v1: accept the drop if the point is within a generous bbox
      // around any space's centerline. The constraint solver then snaps
      // to the actual nearest centerline point.
      const acceptRadiusDeg = 0.001 // ≈ 110 m at the equator — generous for demos
      let best: { space: NavigableSpace; distance: number; dropLon: number; dropLat: number } | null = null

      for (const space of spaces) {
        if (space.kind === 'path' && space.pathGeometry) {
          for (const v of space.pathGeometry.vertices) {
            const d = Math.hypot(v[0] - lon, v[1] - lat)
            if (d < acceptRadiusDeg && (!best || d < best.distance)) {
              best = { space, distance: d, dropLon: lon, dropLat: lat }
            }
          }
        }
        // Volume support comes in Phase E
      }

      return best ? { space: best.space, dropLon: best.dropLon, dropLat: best.dropLat } : null
    },
    [spaces],
  )

  const isValidDropTarget = useCallback(
    (cx: number, cy: number) => {
      const ll = hitGlobeToLonLat(cx, cy)
      if (!ll) return false
      return findNearestSpace(ll.lon, ll.lat) !== null
    },
    [hitGlobeToLonLat, findNearestSpace],
  )

  const onDrop = useCallback(
    async (cx: number, cy: number) => {
      const ll = hitGlobeToLonLat(cx, cy)
      if (!ll) {
        addToast('info', 'Drop on the map.')
        return
      }
      const found = findNearestSpace(ll.lon, ll.lat)
      if (!found) {
        addToast('info', 'No navigable feature here — drop on a pipe or marked feature.')
        return
      }
      onActiveChange(true)
      await probe.activate(found.space, { dropLon: found.dropLon, dropLat: found.dropLat })
    },
    [hitGlobeToLonLat, findNearestSpace, onActiveChange, addToast, probe],
  )

  const onTapModeEnter = useCallback(() => {
    addToast('info', 'Tap a navigable feature to probe it.')
  }, [addToast])

  const drag = useDragActivate({
    glyph: <ProbeGlyph />,
    isValidDropTarget,
    onDrop,
    onTapModeEnter,
  })

  // Wire the drag's pointerdown to the rail tile via ref
  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    const handler = (e: PointerEvent) => {
      drag.tileProps.onPointerDown({
        clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId,
      } as unknown as React.PointerEvent)
    }
    tile.addEventListener('pointerdown', handler)
    tile.dataset.dragActivateTile = 'true'
    return () => {
      tile.removeEventListener('pointerdown', handler)
      delete tile.dataset.dragActivateTile
    }
  }, [tileRef, drag.tileProps])

  // Notify parent of state changes (for Fly integration etc.)
  useEffect(() => {
    onStateChange?.(probe.state)
  }, [probe.state, onStateChange])

  // ESC key exits probe
  useEffect(() => {
    if (!probe.state.active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        probe.exit()
        onActiveChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probe, onActiveChange])

  const handleExit = useCallback(async () => {
    await probe.exit()
    onActiveChange(false)
  }, [probe, onActiveChange])

  /** Sample camera position once per frame for the junction-arrows
   *  proximity test. We only need ~10 Hz fidelity for arrows; setInterval
   *  is fine and avoids piggybacking on the constraint loop. */
  const [cameraPos, setCameraPos] = useState<{ lon: number; lat: number; h: number } | null>(null)
  useEffect(() => {
    if (!probe.state.active || !viewer || viewer.isDestroyed()) return
    const id = window.setInterval(() => {
      if (!viewer || viewer.isDestroyed()) return
      try {
        const carto = Cartographic.fromCartesian(viewer.camera.position)
        setCameraPos({
          lon: CesiumMathLib.toDegrees(carto.longitude),
          lat: CesiumMathLib.toDegrees(carto.latitude),
          h: carto.height,
        })
      } catch {
        /* viewer dying */
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [probe.state.active, viewer])

  const switchToSpace = useCallback(
    async (target: NavigableSpace, headingRad: number) => {
      await probe.activate(target, { headingRad, flyDurationS: 0.4 })
    },
    [probe],
  )

  return (
    <>
      {drag.glyphPortal}
      {/* Centerlines on the surface — always rendered when there are
          spaces, so users can see what's navigable before activating. */}
      <ProbeMapLayer
        viewer={viewer}
        siteSlug={siteSlug}
        activeSpaceId={probe.state.active?.id ?? null}
      />
      {/* Interior 3D tileset (Phase C) — loaded only while probe is
          active and the space declares an interior_tileset_url. */}
      <ProbeTileset viewer={viewer} space={probe.state.active} />
      {/* Junction arrows (Phase D) — render branches at network
          connections within range. */}
      {probe.state.active && (
        <ProbeJunctionArrows
          viewer={viewer}
          activeSpace={probe.state.active}
          t={probe.state.t}
          cameraPos={cameraPos}
          onSwitchSpace={switchToSpace}
        />
      )}
      {probe.state.active && <ProbeOverlay state={probe.state} onExit={handleExit} />}
    </>
  )
}
