import { useEffect, useMemo, useState, useCallback } from 'react'
import { Cartesian3, Cartographic, Math as CesiumMathLib, BillboardCollection } from 'cesium'
import type { Viewer as CesiumViewer } from 'cesium'
import { listConnectionsFor, getSpace } from './registry'
import type { NavigableSpace, NavigableConnection } from './types'

/** ProbeJunctionArrows — renders forward/branch arrows at junctions
 *  when the probe camera is within `2 · r` of the junction.
 *
 *  The arrow is a simple billboard (always-faces-camera). Each
 *  connected space gets its own arrow oriented along that space's
 *  tangent at the junction. Tap an arrow → fly the camera to enter
 *  the connected space.
 *
 *  Phase D scope: forward + back synthesised from the current path's
 *  tangent are always shown; explicit NavigableConnection branches
 *  light up when within range.
 */
interface Props {
  viewer: CesiumViewer | null
  activeSpace: NavigableSpace | null
  /** Camera current params from useProbe. */
  t: number
  /** Camera world position lon/lat/h, sampled per frame. */
  cameraPos?: { lon: number; lat: number; h: number } | null
  /** Activation handler: switch active probe to the connected space. */
  onSwitchSpace: (target: NavigableSpace, headingRad: number) => void
}

const ARROW_BILLBOARD_PNG = createArrowDataUri()

export function ProbeJunctionArrows({
  viewer, activeSpace, t, cameraPos, onSwitchSpace,
}: Props) {
  const [billboards, setBillboards] = useState<BillboardCollection | null>(null)

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const bc = new BillboardCollection({ scene: viewer.scene })
    viewer.scene.primitives.add(bc)
    setBillboards(bc)
    return () => {
      try {
        if (!viewer.isDestroyed()) {
          viewer.scene.primitives.remove(bc)
        }
      } catch {
        /* scene destroyed */
      }
      setBillboards(null)
    }
  }, [viewer])

  const connections = useMemo<NavigableConnection[]>(() => {
    if (!activeSpace) return []
    return listConnectionsFor(activeSpace.id)
  }, [activeSpace])

  useEffect(() => {
    if (!billboards || !activeSpace || !viewer || viewer.isDestroyed()) return
    billboards.removeAll()

    if (!cameraPos) return
    const camPos = Cartesian3.fromDegrees(cameraPos.lon, cameraPos.lat, cameraPos.h)
    const radius = activeSpace.crossSectionRadiusM ?? 0.5

    for (const conn of connections) {
      const [lon, lat, h] = conn.junctionPoint
      const junctionPos = Cartesian3.fromDegrees(lon, lat, h)
      const dist = Cartesian3.distance(camPos, junctionPos)
      if (dist > radius * 4) continue // out of range — don't render yet

      // Determine the "other" space across this connection
      const otherId = conn.fromSpaceId === activeSpace.id ? conn.toSpaceId : conn.fromSpaceId
      const other = getSpace(otherId)
      if (!other || other.kind !== 'path' || !other.pathGeometry) continue

      // Compute the arrow orientation = bearing from junction toward
      // the first vertex of `other` past the junction.
      // (Simple approximation: use the first 2 vertices of the other path.)
      const v0 = other.pathGeometry.vertices[0]
      const v1 = other.pathGeometry.vertices[1] ?? v0
      const bearing = bearingDeg(v0[1], v0[0], v1[1], v1[0])
      // Spawn arrow ~1.2 · r past the junction along that bearing
      const ahead = offsetByMeters(lon, lat, bearing, radius * 1.5)

      billboards.add({
        position: Cartesian3.fromDegrees(ahead[0], ahead[1], h + 0.1),
        image: ARROW_BILLBOARD_PNG,
        width: 56,
        height: 56,
        rotation: CesiumMathLib.toRadians(-bearing),
        id: { __probeArrow: true, connectionId: conn.id, targetSpaceId: otherId, headingRad: CesiumMathLib.toRadians(bearing) },
      })
    }
  }, [billboards, activeSpace, connections, cameraPos, viewer, t])

  /** Handle arrow taps via scene picking. */
  useEffect(() => {
    if (!viewer || !billboards || viewer.isDestroyed()) return
    const handler = (e: MouseEvent) => {
      const rect = viewer.container.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const picked = viewer.scene.pick({ x: cx, y: cy } as never)
      if (!picked) return
      const id = (picked as { id?: { __probeArrow?: boolean; targetSpaceId?: string; headingRad?: number } }).id
      if (!id?.__probeArrow || !id.targetSpaceId) return
      const target = getSpace(id.targetSpaceId)
      if (!target) return
      onSwitchSpace(target, id.headingRad ?? 0)
    }
    viewer.canvas.addEventListener('click', handler)
    return () => viewer.canvas.removeEventListener('click', handler)
  }, [viewer, billboards, onSwitchSpace])

  const _unused = useCallback(() => null, [])
  void _unused
  return null
}

/** Bearing (deg, 0=N, 90=E) between two lat/lon points. */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return ((θ * 180) / Math.PI + 360) % 360
}

/** Move a lon/lat by `meters` along the given bearing (deg). */
function offsetByMeters(lon: number, lat: number, bearingDeg: number, meters: number): [number, number] {
  const R = 6378137
  const δ = meters / R
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]
}

/** Generate a small arrow PNG as a data URI — keeps us from shipping an
 *  asset file. The arrow points right (0° rotation = east); we rotate
 *  via the billboard's `rotation` property to face the right direction. */
function createArrowDataUri(): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = 'rgba(15, 17, 28, 0.4)'
  ctx.beginPath()
  ctx.ellipse(32, 32, 28, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // Arrow body
  ctx.fillStyle = '#a5b4fc'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(14, 26)
  ctx.lineTo(40, 26)
  ctx.lineTo(40, 18)
  ctx.lineTo(56, 32)
  ctx.lineTo(40, 46)
  ctx.lineTo(40, 38)
  ctx.lineTo(14, 38)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return canvas.toDataURL('image/png')
}
