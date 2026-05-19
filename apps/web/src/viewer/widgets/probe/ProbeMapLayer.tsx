import { useEffect, useMemo, useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import {
  Color, PolylineCollection, Material, PointPrimitiveCollection, Cartesian3,
} from 'cesium'
import { listSpaces, listConnectionsFor } from './registry'
import type { NavigableSpace } from './types'

/** ProbeMapLayer — renders NavigableSpace centerlines and connection
 *  junctions on the Cesium globe so the user can see which features
 *  are navigable before activating the Probe widget.
 *
 *  Centerlines render as dashed indigo polylines (clamped to terrain).
 *  Junctions render as small indigo dots.
 *
 *  When `dragHover` is provided, the candidate space highlights
 *  brighter so the user knows where the drop will land.
 */
interface Props {
  viewer: CesiumViewer | null
  siteSlug: string | null
  /** Optional: ID of the space the user is hovering during drag. */
  highlightSpaceId?: string | null
  /** When true (probe is active), render the active path more brightly. */
  activeSpaceId?: string | null
}

export function ProbeMapLayer({ viewer, siteSlug, highlightSpaceId, activeSpaceId }: Props) {
  const [spaces, setSpaces] = useState<NavigableSpace[]>([])

  useEffect(() => {
    if (!siteSlug) {
      setSpaces([])
      return
    }
    setSpaces(listSpaces(siteSlug))
    const onChange = () => setSpaces(listSpaces(siteSlug))
    window.addEventListener('probe-registry-change', onChange)
    return () => window.removeEventListener('probe-registry-change', onChange)
  }, [siteSlug])

  // Build / refresh the Cesium primitives whenever the spaces or highlight change
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return

    const lines = new PolylineCollection()
    const points = new PointPrimitiveCollection()
    viewer.scene.primitives.add(lines)
    viewer.scene.primitives.add(points)

    for (const space of spaces) {
      if (space.kind !== 'path' || !space.pathGeometry) continue
      const positions = space.pathGeometry.vertices.map(([lon, lat, h]) =>
        Cartesian3.fromDegrees(lon, lat, h),
      )

      const isActive = activeSpaceId === space.id
      const isHover = highlightSpaceId === space.id
      const color = isActive
        ? Color.fromCssColorString('#a5b4fc')
        : isHover
        ? Color.fromCssColorString('#818cf8')
        : Color.fromCssColorString('#6366f1').withAlpha(0.7)

      lines.add({
        positions,
        width: isActive ? 5 : isHover ? 4 : 2.5,
        material: Material.fromType('PolylineDash', {
          color,
          dashLength: 16,
          dashPattern: 255,
        }),
      })

      // Endpoint dots
      const endpoints = [positions[0], positions[positions.length - 1]]
      for (const pos of endpoints) {
        points.add({
          position: pos,
          color,
          outlineColor: Color.WHITE.withAlpha(0.8),
          outlineWidth: 1.5,
          pixelSize: isActive ? 9 : isHover ? 8 : 6,
        })
      }

      // Junction dots from connections
      const connections = listConnectionsFor(space.id)
      for (const conn of connections) {
        const [lon, lat, h] = conn.junctionPoint
        points.add({
          position: Cartesian3.fromDegrees(lon, lat, h),
          color: Color.fromCssColorString('#c7d2fe'),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          pixelSize: 10,
        })
      }
    }

    return () => {
      try {
        if (!viewer.isDestroyed()) {
          viewer.scene.primitives.remove(lines)
          viewer.scene.primitives.remove(points)
        }
      } catch {
        /* scene already destroyed */
      }
    }
  }, [viewer, spaces, highlightSpaceId, activeSpaceId])

  const _unused = useMemo(() => null, [])
  void _unused
  return null
}
