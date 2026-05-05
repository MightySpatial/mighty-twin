/** Strike + dip measurement — T+1110.
 *
 *  Strike-and-dip is a geological annotation: pick three points on a
 *  planar surface (say, an exposed bedding plane), and the tool
 *  computes the strike azimuth (compass bearing of the line of
 *  intersection between the plane and horizontal) and the dip angle
 *  (downward tilt from horizontal).
 *
 *  Maths: fit the plane to the three world-space cartesian points,
 *  take its normal, project onto the local east-north-up frame at the
 *  centroid, and read off strike/dip from the projected components.
 *  Right-hand rule: dip direction is 90° clockwise from strike.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from 'cesium'

export interface StrikeMeasurement {
  /** Compass bearing in degrees (0–360, 0 = north). */
  strikeDeg: number
  /** Tilt of the plane in degrees (0 = horizontal, 90 = vertical). */
  dipDeg: number
  /** Compass bearing of the dip direction (perpendicular to strike). */
  dipDirectionDeg: number
  /** The three world-space points the user picked. */
  points: Cartesian3[]
}

interface UseStrikeReturn {
  active: boolean
  picked: Cartesian3[]
  measurement: StrikeMeasurement | null
  start: () => void
  cancel: () => void
  clear: () => void
}

export function useStrike(viewerRef: React.MutableRefObject<Viewer | null>): UseStrikeReturn {
  const [active, setActive] = useState(false)
  const [picked, setPicked] = useState<Cartesian3[]>([])
  const [measurement, setMeasurement] = useState<StrikeMeasurement | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const entitiesRef = useRef<Entity[]>([])

  const clearEntities = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    for (const e of entitiesRef.current) {
      try {
        viewer.entities.remove(e)
      } catch {
        /* viewer destroyed */
      }
    }
    entitiesRef.current = []
  }, [viewerRef])

  const cancel = useCallback(() => {
    handlerRef.current?.destroy()
    handlerRef.current = null
    setActive(false)
    setPicked([])
    clearEntities()
  }, [clearEntities])

  const clear = useCallback(() => {
    cancel()
    setMeasurement(null)
  }, [cancel])

  const start = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    clearEntities()
    setMeasurement(null)
    setPicked([])
    setActive(true)
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    handler.setInputAction((click: { position: Cartesian2 }) => {
      try {
        const ray = viewer.camera.getPickRay(click.position)
        if (!ray) return
        const hit = viewer.scene.pickPosition(click.position) ??
                    viewer.scene.globe.pick(ray, viewer.scene)
        if (!hit) return
        // Add a small marker entity so users see what they picked
        const marker = viewer.entities.add({
          position: hit,
          point: {
            pixelSize: 8,
            color: Color.fromCssColorString('#2dd4bf'),
            outlineColor: Color.fromCssColorString('#0f0f14'),
            outlineWidth: 2,
            heightReference: HeightReference.NONE,
          },
        })
        entitiesRef.current.push(marker)
        setPicked((prev) => {
          const next = [...prev, hit]
          if (next.length === 3) {
            const result = computeStrike(next)
            setMeasurement(result)
            renderAnnotation(viewer, result, entitiesRef.current)
            handler.destroy()
            handlerRef.current = null
            setActive(false)
          }
          return next
        })
      } catch {
        /* viewer mid-destroy or pick failed */
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
  }, [viewerRef, clearEntities])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handlerRef.current?.destroy()
      handlerRef.current = null
      // Don't clear entities on unmount — let the existing measurement
      // persist if the parent re-renders. Explicit clear() removes them.
    }
  }, [])

  return { active, picked, measurement, start, cancel, clear }
}

function computeStrike(points: Cartesian3[]): StrikeMeasurement {
  // Plane normal = cross(p2-p1, p3-p1)
  const v1 = Cartesian3.subtract(points[1], points[0], new Cartesian3())
  const v2 = Cartesian3.subtract(points[2], points[0], new Cartesian3())
  const normal = Cartesian3.cross(v1, v2, new Cartesian3())
  Cartesian3.normalize(normal, normal)

  // Centroid for the local ENU frame
  const centroid = new Cartesian3(
    (points[0].x + points[1].x + points[2].x) / 3,
    (points[0].y + points[1].y + points[2].y) / 3,
    (points[0].z + points[1].z + points[2].z) / 3,
  )

  // Convert normal to local East-North-Up coords at the centroid
  const enuMatrix = Transforms.eastNorthUpToFixedFrame(centroid)
  const inverse = new Array(16)
  // Inverse of a rigid transform: transpose rotation + negate translation
  // CesiumMatrix4.inverseTransformation does the same — but to keep this
  // dep-light we do it by hand.
  const east = new Cartesian3(enuMatrix[0], enuMatrix[1], enuMatrix[2])
  const north = new Cartesian3(enuMatrix[4], enuMatrix[5], enuMatrix[6])
  const up = new Cartesian3(enuMatrix[8], enuMatrix[9], enuMatrix[10])
  void inverse // silence the unused stack-prep we kept for clarity
  const ne = Cartesian3.dot(normal, east)
  const nn = Cartesian3.dot(normal, north)
  const nu = Cartesian3.dot(normal, up)

  // Ensure the normal points up (so dip is between 0 and 90).
  let nx = ne, ny = nn, nz = nu
  if (nz < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }

  // Dip direction: horizontal projection of the normal, pointing
  // "downhill". atan2(east, north) gives compass bearing.
  const dipDirRad = Math.atan2(nx, ny)
  let dipDirectionDeg = (CesiumMath.toDegrees(dipDirRad) + 360) % 360

  // Dip angle: angle between normal and vertical
  const dipDeg = CesiumMath.toDegrees(Math.acos(Math.max(-1, Math.min(1, nz))))

  // Strike: 90° anticlockwise from dip direction (right-hand rule)
  const strikeDeg = (dipDirectionDeg + 270) % 360

  return { strikeDeg, dipDeg, dipDirectionDeg, points }
}

function renderAnnotation(
  viewer: Viewer,
  result: StrikeMeasurement,
  entities: Entity[],
) {
  // Draw the strike line through the centroid in the bedding plane.
  const centroid = new Cartesian3(
    (result.points[0].x + result.points[1].x + result.points[2].x) / 3,
    (result.points[0].y + result.points[1].y + result.points[2].y) / 3,
    (result.points[0].z + result.points[1].z + result.points[2].z) / 3,
  )
  const cart = Cartographic.fromCartesian(centroid)
  const lonDeg = CesiumMath.toDegrees(cart.longitude)
  const latDeg = CesiumMath.toDegrees(cart.latitude)
  const height = cart.height

  // Rough offset along strike — 40 m is enough to be visible at site
  // scale without dominating the view.
  const strikeRad = CesiumMath.toRadians(result.strikeDeg)
  const dx = Math.sin(strikeRad)
  const dy = Math.cos(strikeRad)
  const offsetMetres = 40
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(cart.latitude)
  const halfDLng = (offsetMetres * dx) / mPerDegLng
  const halfDLat = (offsetMetres * dy) / mPerDegLat
  const start = Cartesian3.fromDegrees(lonDeg - halfDLng, latDeg - halfDLat, height)
  const end = Cartesian3.fromDegrees(lonDeg + halfDLng, latDeg + halfDLat, height)

  const line = viewer.entities.add({
    polyline: {
      positions: [start, end],
      width: 4,
      material: new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#2dd4bf'),
        dashLength: 12,
      }),
      clampToGround: false,
    },
  })
  entities.push(line)

  // Tick mark perpendicular to strike, in the dip direction (a
  // textbook strike-and-dip symbol).
  const dipRad = CesiumMath.toRadians(result.dipDirectionDeg)
  const tickLen = 14
  const tdx = Math.sin(dipRad)
  const tdy = Math.cos(dipRad)
  const tickEnd = Cartesian3.fromDegrees(
    lonDeg + (tickLen * tdx) / mPerDegLng,
    latDeg + (tickLen * tdy) / mPerDegLat,
    height,
  )
  const tick = viewer.entities.add({
    polyline: {
      positions: [centroid, tickEnd],
      width: 3,
      material: Color.fromCssColorString('#2dd4bf'),
      clampToGround: false,
    },
  })
  entities.push(tick)

  // Label with the readout — strike / dip / dip-direction
  const label = viewer.entities.add({
    position: end,
    label: {
      text:
        `${result.strikeDeg.toFixed(0).padStart(3, '0')}° / ` +
        `${result.dipDeg.toFixed(0)}° → ` +
        `${result.dipDirectionDeg.toFixed(0).padStart(3, '0')}°`,
      font: '12px monospace',
      fillColor: Color.fromCssColorString('#f0f2f8'),
      backgroundColor: Color.fromCssColorString('rgba(15,15,20,0.92)'),
      showBackground: true,
      style: LabelStyle.FILL,
      pixelOffset: new Cartesian2(8, 0),
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.CENTER,
    },
  })
  entities.push(label)
}
