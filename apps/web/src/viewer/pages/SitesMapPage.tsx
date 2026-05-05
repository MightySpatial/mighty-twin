/**
 * MightyTwin — All Sites Globe View
 * Shows all sites as pins on a Cesium globe.
 * Click a pin to select → "Zoom to" button → fly & navigate.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  VerticalOrigin,
  Cartesian2,
  Color,
  LabelStyle,
  Terrain,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  ConstantProperty,
} from 'cesium'
import { ArrowLeft, Navigation } from 'lucide-react'
import { useTokenFetch } from '../components/CesiumViewer/hooks/useTokenFetch'
import { pointSymbolToDataUrl } from '../shared/pointSymbology'
import { authFetch } from '../utils/authFetch'
import { flyToTarget } from '../utils/flyToTarget'
import SplashOverlay from '../components/SplashOverlay/SplashOverlay'
import type { PublicSettings, OverlayConfig } from '../types/api'
import type { PointSymbolType } from '../shared/pointSymbology'

import 'cesium/Build/Cesium/Widgets/widgets.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const DEFAULT_PIN_COLOR = '#6366F1'
const VALID_SYMBOLS = new Set(['pin', 'circle', 'square', 'star', 'diamond'])

interface SiteWithCamera {
  slug: string
  name: string
  longitude: number
  latitude: number
  height?: number
  marker_color?: string
  marker_symbol?: string
}

function resolveSymbol(raw?: string): PointSymbolType {
  if (raw && VALID_SYMBOLS.has(raw)) return raw as PointSymbolType
  return 'pin'
}

export default function SitesMapPage() {
  const navigate = useNavigate()
  const tokenReady = useTokenFetch()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumViewerType | null>(null)
  const destroyedRef = useRef(false)

  const sitesWithCamera = useRef<SiteWithCamera[]>([])
  const sitesLoaded = useRef(false)

  // Selection state
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const selectedSlugRef = useRef<string | null>(null)
  const selectedSite = selectedSlug
    ? sitesWithCamera.current.find(s => s.slug === selectedSlug) ?? null
    : null

  // Home widget state
  const [homeWidget, setHomeWidget] = useState<PublicSettings | null>(null)
  const [homeWidgetDismissed, setHomeWidgetDismissed] = useState(
    () => sessionStorage.getItem('home_widget_dismissed') === 'true'
  )

  // Zoom splash state
  const [zoomSplashSite, setZoomSplashSite] = useState<string | null>(null)
  const [zoomSplashConfig, setZoomSplashConfig] = useState<OverlayConfig | null>(null)
  const [zoomSplashVisible, setZoomSplashVisible] = useState(false)

  // Navigate to site, showing zoom splash if configured
  const navigateToSite = useCallback((slug: string) => {
    authFetch(`${API_URL}/api/spatial/sites/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const oc = data?.overlay_config as OverlayConfig | undefined
        if (oc?.zoom_splash_enabled) {
          setZoomSplashSite(slug)
          setZoomSplashConfig(oc)
          setZoomSplashVisible(true)
        } else {
          navigate(`/viewer/site/${slug}`)
        }
      })
      .catch(() => navigate(`/viewer/site/${slug}`))
  }, [navigate])

  // Overview camera from public settings
  const overviewCameraRef = useRef<{ lon: number; lat: number; height: number }>({
    lon: 133, lat: -28, height: 4000000,
  })

  useEffect(() => {
    fetch(`${API_URL}/api/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then((data: PublicSettings | null) => {
        if (!data) return
        if (data.home_widget_enabled) setHomeWidget(data)
        if (data.overview_camera_lon != null && data.overview_camera_lat != null && data.overview_camera_height != null) {
          overviewCameraRef.current = {
            lon: data.overview_camera_lon,
            lat: data.overview_camera_lat,
            height: data.overview_camera_height,
          }
          // If viewer already initialised, fly to the correct position
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.camera.flyTo({
              destination: Cartesian3.fromDegrees(data.overview_camera_lon, data.overview_camera_lat, data.overview_camera_height),
              duration: 0,
            })
          }
        }
      })
      .catch(() => {})
  }, [])

  // Keep ref in sync so the Cesium click handler always sees latest
  useEffect(() => { selectedSlugRef.current = selectedSlug }, [selectedSlug])

  // Update pin opacity/scale when selection changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed() || !sitesLoaded.current) return

    for (const site of sitesWithCamera.current) {
      const entity = viewer.entities.getById(`__site_pin_${site.slug}`)
      if (!entity?.billboard) continue

      if (selectedSlug === null) {
        // No selection — full opacity, normal scale
        entity.billboard.color = new ConstantProperty(Color.WHITE)
        entity.billboard.scale = new ConstantProperty(1.2)
      } else if (site.slug === selectedSlug) {
        // Selected — full opacity, enlarged
        entity.billboard.color = new ConstantProperty(Color.WHITE)
        entity.billboard.scale = new ConstantProperty(1.6)
      } else {
        // Not selected — faded
        entity.billboard.color = new ConstantProperty(Color.WHITE.withAlpha(0.5))
        entity.billboard.scale = new ConstantProperty(1.2)
      }
    }
  }, [selectedSlug])

  const setupGlobe = useCallback(() => {
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
      creditContainer: document.createElement('div'),
    })

    viewer.scene.globe.enableLighting = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true

    // Use overview camera from settings
    const cam = overviewCameraRef.current
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(cam.lon, cam.lat, cam.height),
      duration: 0,
    })

    viewerRef.current = viewer

    // Load sites and add per-site pins
    authFetch(`${API_URL}/api/spatial/sites`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load sites')
        return r.json()
      })
      .then((sites: Array<{
        slug: string
        name: string
        marker_color?: string
        marker_symbol?: string
        default_camera?: { longitude: number; latitude: number; height: number }
      }>) => {
        if (viewer.isDestroyed()) return

        // If only 1 site, navigate directly (skip selection UX)
        if (sites.length === 1 && sites[0].default_camera) {
          const s = sites[0]
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(s.default_camera!.longitude, s.default_camera!.latitude, s.default_camera!.height ?? 800),
            duration: 1.5,
            complete: () => navigateToSite(s.slug),
          })
          return
        }

        const loaded: SiteWithCamera[] = []
        for (const site of sites) {
          if (!site.default_camera) continue
          const { longitude, latitude, height } = site.default_camera
          loaded.push({
            slug: site.slug,
            name: site.name,
            longitude,
            latitude,
            height,
            marker_color: site.marker_color,
            marker_symbol: site.marker_symbol,
          })

          const pinColor = site.marker_color || DEFAULT_PIN_COLOR
          const pinSymbol = resolveSymbol(site.marker_symbol)

          const pinImage = pointSymbolToDataUrl({
            symbolType: pinSymbol,
            size: 28,
            fillColor: pinColor,
            strokeColor: '#ffffff',
            opacity: 1.0,
          })

          viewer.entities.add({
            id: `__site_pin_${site.slug}`,
            position: Cartesian3.fromDegrees(longitude, latitude, 0),
            billboard: {
              image: pinImage,
              verticalOrigin: VerticalOrigin.BOTTOM,
              scale: 1.2,
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
        }
        sitesWithCamera.current = loaded
        sitesLoaded.current = true
      })
      .catch(() => {})

    // Click handler: select pin or deselect
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position)
      if (picked?.id?.id) {
        const entityId = picked.id.id as string
        if (entityId.startsWith('__site_pin_')) {
          const slug = entityId.replace('__site_pin_', '')

          // If already selected, this is a second click — navigate.
          // Use the bounding-sphere zoom so the camera frames the
          // pin from a tilted angle rather than diving onto the
          // address.
          if (selectedSlugRef.current === slug) {
            const site = sitesWithCamera.current.find(s => s.slug === slug)
            if (site) {
              flyToTarget(viewer, {
                longitude: site.longitude,
                latitude: site.latitude,
                height: 0,
                range: site.height ?? 800,
                duration: 1.5,
                onComplete: () => navigateToSite(slug),
              })
            }
            return
          }

          // First click — select
          setSelectedSlug(slug)
          return
        }
      }
      // Clicked elsewhere — deselect
      setSelectedSlug(null)
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      destroyedRef.current = true
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [tokenReady, navigate, navigateToSite])

  useEffect(() => {
    const cleanup = setupGlobe()
    return () => { cleanup?.() }
  }, [setupGlobe])

  const handleZoomTo = useCallback(() => {
    if (!selectedSite || !viewerRef.current || viewerRef.current.isDestroyed()) return
    flyToTarget(viewerRef.current, {
      longitude: selectedSite.longitude,
      latitude: selectedSite.latitude,
      height: 0,
      range: selectedSite.height ?? 800,
      duration: 1.5,
      onComplete: () => navigateToSite(selectedSite.slug),
    })
  }, [selectedSite, navigateToSite])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0f0f14' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: 'rgba(15,15,20,0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          backdropFilter: 'blur(8px)',
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Title — shows selected site name or "All Sites" */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          padding: '8px 18px',
          background: 'rgba(15,15,20,0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}
      >
        {selectedSite ? selectedSite.name : 'All Sites'}
      </div>

      {/* "Zoom to" button — appears when a site is selected */}
      {selectedSite && (
        <button
          onClick={handleZoomTo}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'rgba(99,102,241,0.9)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            backdropFilter: 'blur(8px)',
          }}
        >
          <Navigation size={16} />
          Zoom to {selectedSite.name}
        </button>
      )}

      {homeWidget && !homeWidgetDismissed && (
        <SplashOverlay
          title={homeWidget.home_widget_title ?? 'Welcome'}
          message={
            (homeWidget.home_widget_message ?? '') +
            (homeWidget.home_widget_support_email
              ? `<br/><br/>Support: <a href="mailto:${homeWidget.home_widget_support_email}">${homeWidget.home_widget_support_email}</a>`
              : '')
          }
          onDismiss={() => {
            setHomeWidgetDismissed(true)
            sessionStorage.setItem('home_widget_dismissed', 'true')
          }}
        />
      )}

      {zoomSplashVisible && zoomSplashConfig && zoomSplashSite && (
        <SplashOverlay
          title={zoomSplashConfig.zoom_splash_title ?? 'Site Information'}
          message={zoomSplashConfig.zoom_splash_content ?? ''}
          autoDismissSecs={zoomSplashConfig.zoom_splash_auto_dismiss_secs}
          onDismiss={() => {
            setZoomSplashVisible(false)
            navigate(`/viewer/site/${zoomSplashSite}`)
          }}
        />
      )}
    </div>
  )
}
