/**
 * MightyTwin — Site Focal Point Pin
 * Shows a billboard pin at the site's focal point when the camera is >2km away.
 * Terrain-sampled position ensures correct distance check on elevated sites.
 */
import { useEffect, useRef } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Cartographic,
  VerticalOrigin,
  Cartesian2,
  Color,
  LabelStyle,
  Entity,
  sampleTerrainMostDetailed,
} from 'cesium'
import type { SiteData } from '../../../types/api'
import { pointSymbolToDataUrl } from '../../../shared/pointSymbology'
import type { PointSymbolType } from '../../../shared/pointSymbology'

const PIN_ENTITY_ID = '__site_focal_pin__'
const PIN_HIDE_DISTANCE = 2000 // 2 km
const THROTTLE_MS = 200 // ~5fps while camera is moving

const VALID_SYMBOLS = new Set(['pin', 'circle', 'square', 'star', 'diamond'])

function resolveSymbol(s?: string | null): PointSymbolType {
  return (s && VALID_SYMBOLS.has(s) ? s : 'pin') as PointSymbolType
}

export function useSiteFocalPin(
  viewerRef: React.RefObject<CesiumViewerType | null>,
  site: SiteData | null | undefined,
) {
  const entityRef = useRef<Entity | null>(null)

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !site?.default_camera) return

    const { longitude, latitude } = site.default_camera

    const pinColor = site.marker_color || site.primary_color || '#6366F1'
    const pinSymbol = resolveSymbol(site.marker_symbol)

    const pinImage = pointSymbolToDataUrl({
      symbolType: pinSymbol,
      size: 32,
      fillColor: pinColor,
      strokeColor: '#ffffff',
      opacity: 1.0,
    })

    // Remove any stale entity
    const existing = viewer.entities.getById(PIN_ENTITY_ID)
    if (existing) viewer.entities.remove(existing)

    // Start at sea level; terrain sample will update
    let sitePoint = Cartesian3.fromDegrees(longitude, latitude, 0)

    const entity = viewer.entities.add({
      id: PIN_ENTITY_ID,
      position: sitePoint,
      show: false,
      billboard: {
        image: pinImage,
        verticalOrigin: VerticalOrigin.BOTTOM,
        scale: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: site.name,
        font: '14px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, 8),
        verticalOrigin: VerticalOrigin.TOP,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    entityRef.current = entity

    // ── Visibility check ────────────────────────────────────────────────────
    let lastVisible: boolean | null = null
    let isMoving = false
    let lastCheckTime = 0

    function checkVisibility() {
      if (!viewer || viewer.isDestroyed() || !entityRef.current) return
      const dist = Cartesian3.distance(viewer.camera.positionWC, sitePoint)
      const shouldShow = dist > PIN_HIDE_DISTANCE
      if (shouldShow !== lastVisible) {
        entityRef.current.show = shouldShow
        lastVisible = shouldShow
      }
    }

    // ── Terrain sampling — async update to accurate height ──────────────────
    sampleTerrainMostDetailed(viewer.terrainProvider, [
      Cartographic.fromDegrees(longitude, latitude),
    ])
      .then(sampled => {
        const terrainHeight = sampled[0]?.height ?? 0
        sitePoint = Cartesian3.fromDegrees(longitude, latitude, terrainHeight)
        checkVisibility()
      })
      .catch(() => {}) // fallback to height=0 is fine

    // ── Camera event listeners (zero overhead when camera is still) ─────────
    function onMoveStart() { isMoving = true }
    function onMoveEnd() { isMoving = false; checkVisibility() }
    function onPostRender() {
      if (!isMoving) return
      const now = performance.now()
      if (now - lastCheckTime < THROTTLE_MS) return
      lastCheckTime = now
      checkVisibility()
    }

    viewer.camera.moveStart.addEventListener(onMoveStart)
    viewer.camera.moveEnd.addEventListener(onMoveEnd)
    viewer.scene.postRender.addEventListener(onPostRender)

    // Initial check
    checkVisibility()

    return () => {
      viewer.camera.moveStart.removeEventListener(onMoveStart)
      viewer.camera.moveEnd.removeEventListener(onMoveEnd)
      viewer.scene.postRender.removeEventListener(onPostRender)
      if (!viewer.isDestroyed()) {
        const e = viewer.entities.getById(PIN_ENTITY_ID)
        if (e) viewer.entities.remove(e)
      }
      entityRef.current = null
    }
  }, [viewerRef, site?.default_camera?.longitude, site?.default_camera?.latitude, site?.name, site?.marker_color, site?.primary_color, site?.marker_symbol])
}
