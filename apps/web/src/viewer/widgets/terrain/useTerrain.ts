/** Terrain sectioning — T+1170.
 *
 *  Pick two points → sample terrain along a great-circle interpolation
 *  → expose the elevation profile + stats. Renders a section line on
 *  the globe and a hover-synced marker that tracks the chart cursor.
 *
 *  We sample at ``DEFAULT_SAMPLES`` (200) intervals which is plenty
 *  for sites up to a few km long; very long sections (10+ km) still
 *  render fine but the chart becomes visibly stepped between samples.
 *  A future iteration could adapt the sample count to the line length.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  type Entity,
  HeightReference,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  sampleTerrainMostDetailed,
  type Viewer,
} from 'cesium'

const DEFAULT_SAMPLES = 200

export interface SamplePoint {
  /** Distance from start, metres. */
  distance: number
  /** Elevation above the ellipsoid, metres. */
  height: number
  longitude: number
  latitude: number
}

export interface SectionStats {
  distance: number
  minHeight: number
  maxHeight: number
  avgHeight: number
  /** Total positive elevation gain (metres). */
  ascent: number
  /** Total elevation loss (metres). */
  descent: number
  /** Mean absolute slope along the section (degrees). */
  avgSlope: number
  maxSlope: number
}

export interface TerrainSection {
  start: { longitude: number; latitude: number }
  end: { longitude: number; latitude: number }
  samples: SamplePoint[]
  stats: SectionStats
  sampledAt: number
}

export type SectionStatus = 'idle' | 'picking' | 'sampling' | 'ready' | 'error'

interface UseTerrainReturn {
  status: SectionStatus
  pickedCount: number
  section: TerrainSection | null
  error: string | null
  /** Begin a new section pick — clears any previous state. */
  start: () => void
  /** Abort an in-progress pick. */
  cancel: () => void
  /** Remove the section + on-globe annotations entirely. */
  clear: () => void
  /** Set the chart hover cursor → moves the on-globe marker. */
  setCursor: (sampleIndex: number | null) => void
}

export function useTerrain(viewerRef: React.MutableRefObject<Viewer | null>): UseTerrainReturn {
  const [status, setStatus] = useState<SectionStatus>('idle')
  const [pickedCount, setPickedCount] = useState(0)
  const [section, setSection] = useState<TerrainSection | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const entitiesRef = useRef<Entity[]>([])
  const cursorEntityRef = useRef<Entity | null>(null)
  const pickedRef = useRef<Cartographic[]>([])

  const removeEntity = useCallback((e: Entity | null) => {
    if (!e) return
    const viewer = viewerRef.current
    try {
      viewer?.entities.remove(e)
    } catch {
      /* viewer destroyed */
    }
  }, [viewerRef])

  const clearAnnotations = useCallback(() => {
    for (const e of entitiesRef.current) removeEntity(e)
    entitiesRef.current = []
    removeEntity(cursorEntityRef.current)
    cursorEntityRef.current = null
  }, [removeEntity])

  const cancel = useCallback(() => {
    handlerRef.current?.destroy()
    handlerRef.current = null
    pickedRef.current = []
    setPickedCount(0)
    setStatus('idle')
    // Bump the sample token so any in-flight sampleTerrainMostDetailed
    // promise drops its result when it eventually resolves.
    sampleTokenRef.current++
  }, [])

  const clear = useCallback(() => {
    cancel()
    clearAnnotations()
    setSection(null)
    setError(null)
  }, [cancel, clearAnnotations])

  const start = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    cancel()
    clearAnnotations()
    setSection(null)
    setError(null)
    pickedRef.current = []
    setPickedCount(0)
    setStatus('picking')

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    handler.setInputAction(async (click: { position: Cartesian2 }) => {
      try {
        const ray = viewer.camera.getPickRay(click.position)
        if (!ray) return
        const hit =
          viewer.scene.pickPosition(click.position) ??
          viewer.scene.globe.pick(ray, viewer.scene)
        if (!hit) return
        const carto = Cartographic.fromCartesian(hit)
        pickedRef.current = [...pickedRef.current, carto]
        setPickedCount(pickedRef.current.length)

        // Marker for the click
        const marker = viewer.entities.add({
          position: hit,
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString('#f59e0b'),
            outlineColor: Color.fromCssColorString('#0f0f14'),
            outlineWidth: 2,
            heightReference: HeightReference.NONE,
          },
        })
        entitiesRef.current.push(marker)

        if (pickedRef.current.length === 2) {
          handler.destroy()
          handlerRef.current = null
          setStatus('sampling')
          await runSample(viewer, pickedRef.current[0], pickedRef.current[1])
        }
      } catch (e) {
        setError((e as Error).message)
        setStatus('error')
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
  }, [viewerRef, cancel, clearAnnotations])

  const sampleTokenRef = useRef(0)
  const runSample = useCallback(
    async (viewer: Viewer, a: Cartographic, b: Cartographic) => {
      const token = ++sampleTokenRef.current
      try {
        // Reject zero-length sections — they collapse the chart axis.
        if (
          Math.abs(a.longitude - b.longitude) < 1e-9 &&
          Math.abs(a.latitude - b.latitude) < 1e-9
        ) {
          throw new Error('Pick two distinct points to section between.')
        }
        const probes: Cartographic[] = []
        const samples = DEFAULT_SAMPLES
        for (let i = 0; i <= samples; i++) {
          const t = i / samples
          probes.push(
            new Cartographic(
              a.longitude + (b.longitude - a.longitude) * t,
              a.latitude + (b.latitude - a.latitude) * t,
            ),
          )
        }
        const filled = await sampleTerrainMostDetailed(
          viewer.terrainProvider,
          probes,
        )
        // If the widget closed or another section started while we
        // were sampling, drop the result on the floor.
        if (token !== sampleTokenRef.current) return
        const points: SamplePoint[] = []
        let total = 0
        for (let i = 0; i < filled.length; i++) {
          const c = filled[i]
          if (i > 0) {
            const prev = filled[i - 1]
            const geo = new EllipsoidGeodesic(prev, c)
            total += geo.surfaceDistance
          }
          points.push({
            distance: total,
            height: c.height ?? 0,
            longitude: CesiumMath.toDegrees(c.longitude),
            latitude: CesiumMath.toDegrees(c.latitude),
          })
        }
        const stats = computeStats(points)
        const built: TerrainSection = {
          start: {
            longitude: CesiumMath.toDegrees(a.longitude),
            latitude: CesiumMath.toDegrees(a.latitude),
          },
          end: {
            longitude: CesiumMath.toDegrees(b.longitude),
            latitude: CesiumMath.toDegrees(b.latitude),
          },
          samples: points,
          stats,
          sampledAt: Date.now(),
        }
        setSection(built)
        renderSectionLine(viewer, built, entitiesRef)
        setStatus('ready')
      } catch (e) {
        setError((e as Error).message)
        setStatus('error')
      }
    },
    [],
  )

  const setCursor = useCallback(
    (sampleIndex: number | null) => {
      const viewer = viewerRef.current
      if (!viewer) return
      if (!section || sampleIndex === null) {
        if (cursorEntityRef.current) {
          removeEntity(cursorEntityRef.current)
          cursorEntityRef.current = null
        }
        return
      }
      const sample = section.samples[sampleIndex]
      if (!sample) return
      const pos = Cartesian3.fromDegrees(sample.longitude, sample.latitude, sample.height)
      if (!cursorEntityRef.current) {
        cursorEntityRef.current = viewer.entities.add({
          position: pos,
          point: {
            pixelSize: 12,
            color: Color.fromCssColorString('#2dd4bf'),
            outlineColor: Color.fromCssColorString('#0f0f14'),
            outlineWidth: 2,
            heightReference: HeightReference.NONE,
          },
        })
      } else {
        cursorEntityRef.current.position = pos as never
      }
    },
    [viewerRef, section, removeEntity],
  )

  // Cleanup on unmount — leave the entities the user might still be
  // looking at; explicit clear() removes them.
  useEffect(() => {
    return () => {
      handlerRef.current?.destroy()
      handlerRef.current = null
    }
  }, [])

  return { status, pickedCount, section, error, start, cancel, clear, setCursor }
}

function computeStats(samples: SamplePoint[]): SectionStats {
  if (samples.length === 0) {
    return {
      distance: 0,
      minHeight: 0,
      maxHeight: 0,
      avgHeight: 0,
      ascent: 0,
      descent: 0,
      avgSlope: 0,
      maxSlope: 0,
    }
  }
  let min = samples[0].height
  let max = samples[0].height
  let sumH = 0
  let ascent = 0
  let descent = 0
  let sumSlope = 0
  let maxSlope = 0
  let slopeCount = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (s.height < min) min = s.height
    if (s.height > max) max = s.height
    sumH += s.height
    if (i > 0) {
      const dh = s.height - samples[i - 1].height
      const dd = s.distance - samples[i - 1].distance
      if (dd > 0) {
        if (dh > 0) ascent += dh
        else descent += -dh
        const slope = Math.abs(Math.atan2(dh, dd))
        sumSlope += slope
        if (slope > maxSlope) maxSlope = slope
        slopeCount++
      }
    }
  }
  return {
    distance: samples[samples.length - 1].distance,
    minHeight: min,
    maxHeight: max,
    avgHeight: sumH / samples.length,
    ascent,
    descent,
    avgSlope: slopeCount > 0 ? CesiumMath.toDegrees(sumSlope / slopeCount) : 0,
    maxSlope: CesiumMath.toDegrees(maxSlope),
  }
}

function renderSectionLine(
  viewer: Viewer,
  section: TerrainSection,
  entitiesRef: React.MutableRefObject<Entity[]>,
) {
  // Polyline along the sampled positions — clamps to the terrain so
  // it draws *on* the surface rather than through it.
  const positions = section.samples.map((s) =>
    Cartesian3.fromDegrees(s.longitude, s.latitude, s.height),
  )
  const line = viewer.entities.add({
    polyline: {
      positions,
      width: 3,
      material: Color.fromCssColorString('#2dd4bf').withAlpha(0.95),
      clampToGround: false,
    },
  })
  entitiesRef.current.push(line)

  // Translucent "wall" beneath the line so users see the cross-section
  // visually in 3D — bottom of the wall sits at the section's minimum
  // elevation minus a small margin so it always reads as a slab.
  const minH = section.stats.minHeight - 5
  const wallTop = positions
  const wallBottom = section.samples.map((s) =>
    Cartesian3.fromDegrees(s.longitude, s.latitude, minH),
  )
  const wallStrip: Cartesian3[] = []
  for (let i = 0; i < wallTop.length; i++) {
    wallStrip.push(wallTop[i])
    wallStrip.push(wallBottom[i])
  }
  // Use a polyline as a simple visual cue rather than a full polygon
  // mesh — keeps the entity count low and renders without z-fighting.
  for (let i = 0; i < wallTop.length; i += 8) {
    const tick = viewer.entities.add({
      polyline: {
        positions: [wallTop[i], wallBottom[i]],
        width: 1,
        material: new PolylineDashMaterialProperty({
          color: Color.fromCssColorString('#2dd4bf').withAlpha(0.4),
          dashLength: 6,
        }),
      },
    })
    entitiesRef.current.push(tick)
  }
  const baseLine = viewer.entities.add({
    polyline: {
      positions: section.samples.map((s) =>
        Cartesian3.fromDegrees(s.longitude, s.latitude, minH),
      ),
      width: 1,
      material: Color.fromCssColorString('#2dd4bf').withAlpha(0.4),
    },
  })
  entitiesRef.current.push(baseLine)
}
