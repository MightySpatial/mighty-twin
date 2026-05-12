/** SitesMapView — embedded Cesium globe + SiteStrip for the Atlas
 *  Sites page (Phase 5 of mockups/IMPLEMENTATION.md).
 *
 *  Mirrors the per-pin behaviour from the viewer's SitesMapPage but
 *  navigates to the Atlas detail page (`/admin/sites/<slug>`) instead
 *  of the viewer route. The SiteStrip overlay at the bottom doubles
 *  as the card carousel.
 *
 *  Lightweight by design — no measure / no widget rail / no
 *  ViewerSidebar. Just a globe with pins + the strip. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Cartesian2,
  VerticalOrigin,
  Color,
  LabelStyle,
  Terrain,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  ConstantProperty,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import { useTokenFetch } from '../../viewer/components/CesiumViewer/hooks/useTokenFetch'
import { pointSymbolToDataUrl } from '../../viewer/shared/pointSymbology'
import { SiteStrip } from '../../viewer/components/SiteStrip/SiteStrip'

const DEFAULT_PIN_COLOR = '#6366F1'

interface AtlasSite {
  slug: string
  name: string
  description?: string | null
  layer_count?: number
  primary_color?: string | null
  is_public_pre_login?: boolean
  default_camera?: { longitude: number; latitude: number; height: number } | null
  marker_color?: string | null
}

interface SitesMapViewProps {
  sites: AtlasSite[]
  /** Optional fixed height. Defaults to filling the parent. */
  height?: number | string
}

export default function SitesMapView({ sites, height }: SitesMapViewProps) {
  const navigate = useNavigate()
  const tokenReady = useTokenFetch()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumViewerType | null>(null)
  const destroyedRef = useRef(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const selectedSlugRef = useRef<string | null>(null)
  useEffect(() => {
    selectedSlugRef.current = selectedSlug
  }, [selectedSlug])

  // Pins re-render when selection changes (faded for unselected,
  // enlarged for selected — same pattern as the viewer overview).
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    for (const site of sites) {
      const entity = viewer.entities.getById(`__atlas_pin_${site.slug}`)
      if (!entity?.billboard) continue
      if (selectedSlug === null) {
        entity.billboard.color = new ConstantProperty(Color.WHITE)
        entity.billboard.scale = new ConstantProperty(1.2)
      } else if (site.slug === selectedSlug) {
        entity.billboard.color = new ConstantProperty(Color.WHITE)
        entity.billboard.scale = new ConstantProperty(1.6)
      } else {
        entity.billboard.color = new ConstantProperty(Color.WHITE.withAlpha(0.5))
        entity.billboard.scale = new ConstantProperty(1.2)
      }
    }
  }, [selectedSlug, sites])

  const onSelectFromStrip = useCallback(
    (slug: string) => {
      const target = sites.find((s) => s.slug === slug)
      const viewer = viewerRef.current
      if (target?.default_camera && viewer && !viewer.isDestroyed()) {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(
            target.default_camera.longitude,
            target.default_camera.latitude,
            target.default_camera.height ?? 1500,
          ),
          duration: 1.2,
        })
      }
      setSelectedSlug(slug)
    },
    [sites],
  )

  useEffect(() => {
    if (!tokenReady || !containerRef.current || viewerRef.current || destroyedRef.current) return
    const viewer = new CesiumViewerType(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      infoBox: false,
      terrain: Terrain.fromWorldTerrain(),
    })
    viewer.scene.globe.enableLighting = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(133, -28, 4000000),
      duration: 0,
    })
    viewerRef.current = viewer

    for (const site of sites) {
      if (!site.default_camera) continue
      const { longitude, latitude } = site.default_camera
      const pinColor = site.marker_color || site.primary_color || DEFAULT_PIN_COLOR
      const pinImage = pointSymbolToDataUrl({
        symbolType: 'pin',
        size: 28,
        fillColor: pinColor,
        strokeColor: '#ffffff',
        opacity: 1.0,
      })
      viewer.entities.add({
        id: `__atlas_pin_${site.slug}`,
        position: Cartesian3.fromDegrees(longitude, latitude, 0),
        billboard: {
          image: pinImage,
          verticalOrigin: VerticalOrigin.BOTTOM,
          scale: 1.2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: site.name,
          font: '13px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, 8),
          verticalOrigin: VerticalOrigin.TOP,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position)
      const id = picked?.id?.id as string | undefined
      if (id?.startsWith('__atlas_pin_')) {
        const slug = id.replace('__atlas_pin_', '')
        // Second click on the same pin → navigate.
        if (selectedSlugRef.current === slug) {
          navigate(`/admin/sites/${slug}`)
          return
        }
        setSelectedSlug(slug)
        return
      }
      setSelectedSlug(null)
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      destroyedRef.current = true
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [tokenReady, sites, navigate])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: height ?? '70vh',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.07)',
        background: '#0a0c14',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {sites.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <div style={{ width: '100%', maxWidth: 960, pointerEvents: 'auto' }}>
            <SiteStrip
              sites={sites.map((s) => ({
                slug: s.slug,
                name: s.name,
                description: s.description,
                is_public_pre_login: s.is_public_pre_login,
                layer_count: s.layer_count,
                primary_color: s.primary_color,
              }))}
              activeSiteSlug={selectedSlug}
              onSelectSite={(slug) => onSelectFromStrip(slug)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
