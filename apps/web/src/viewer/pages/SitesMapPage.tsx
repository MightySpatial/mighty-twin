/**
 * MightyTwin — All Sites Globe View
 * Shows all sites as pins on a Cesium globe.
 * Click a pin to select → "Zoom to" button → fly & navigate.
 */
import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  VerticalOrigin,
  Cartesian2,
  Color,
  LabelStyle,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  ConstantProperty,
} from 'cesium'
import { getBasemapFallbackOptions } from '../shared/basemapFallback'
import { Navigation } from 'lucide-react'
import { useTokenFetch } from '../components/CesiumViewer/hooks/useTokenFetch'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { pointSymbolToDataUrl } from '../shared/pointSymbology'
import { authFetch } from '../utils/authFetch'
import { flyToTarget } from '../utils/flyToTarget'
import SplashOverlay from '../components/SplashOverlay/SplashOverlay'
import { CtrlPill } from '../components/CtrlPill/CtrlPill'
import { SiteStrip } from '../components/SiteStrip/SiteStrip'
import { FloatingIconStack } from '../components/FloatingIconStack'
import type { FloatingIconStackItem } from '../components/FloatingIconStack'
import MeasureWidget, { useMeasure } from '../widgets/measure'
import { Ruler, Search as SearchIcon } from 'lucide-react'
import type { PublicSettings, OverlayConfig, SiteListItem } from '../types/api'
import type { SiteEntry } from '../components/SitePicker'
import type { PointSymbolType } from '../shared/pointSymbology'

import 'cesium/Build/Cesium/Widgets/widgets.css'
import { branding } from '../../branding'

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
  // Phase 3 pivot: tablet portrait gets the phone-style sidebar layout;
  // tablet landscape mirrors desktop.
  const { layoutMode } = useBreakpoint()
  const isMobile = layoutMode === 'phone' || layoutMode === 'tabletPortrait'
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumViewerType | null>(null)
  const destroyedRef = useRef(false)

  // ── Measure widget — wired into the FloatingIconStack ─────────────
  const {
    measureActive, measureRunning, measureResult, measureMode, setMeasureMode,
    startMeasure, cancelMeasure, cleanupMeasure, setMeasureResult,
  } = useMeasure(viewerRef)

  const sitesWithCamera = useRef<SiteWithCamera[]>([])
  const sitesLoaded = useRef(false)
  // Mirror of sitesWithCamera for reactive rendering (dropdown list).
  const [loadedSites, setLoadedSites] = useState<SiteWithCamera[]>([])

  // Full /api/spatial/sites payload — feeds the sidebar's Site tab
  // picker (which wants slug/name/description/layer_count/etc.).
  const [pickerSites, setPickerSites] = useState<SiteEntry[]>([])
  const [pickerLoading, setPickerLoading] = useState(true)

  // Selection state
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const selectedSlugRef = useRef<string | null>(null)
  const selectedSite = selectedSlug
    ? sitesWithCamera.current.find(s => s.slug === selectedSlug) ?? null
    : null

  // Home widget state — now rendered inside the sidebar's Home tab
  // rather than a fullscreen SplashOverlay.
  const [homeWidget, setHomeWidget] = useState<PublicSettings | null>(null)

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

    const fallback = getBasemapFallbackOptions()
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
      // OSM + ellipsoid fallback when no Ion token is configured —
      // otherwise Bing Aerial (Ion default) leaves a black globe.
      baseLayer: fallback.baseLayer,
      terrain: fallback.terrain,
      // creditContainer omitted — Cesium creates one inside the viewer
      // host so basemap attribution renders. The Cesium logo + "Data
      // attribution" expand link are hidden via CSS (see
      // CesiumViewer.css :: .cesium-credit-logoContainer).
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
      .then((sites: Array<SiteListItem & {
        marker_color?: string
        marker_symbol?: string
        description?: string | null
        primary_color?: string | null
        is_public_pre_login?: boolean
        default_camera?: { longitude: number; latitude: number; height: number }
      }>) => {
        if (viewer.isDestroyed()) return

        // Feed the sidebar's Site tab. Mapping is direct — the
        // SitePicker is permissive about missing optional fields.
        setPickerSites(sites.map(s => ({
          slug: s.slug,
          name: s.name,
          description: s.description ?? null,
          is_public_pre_login: s.is_public_pre_login,
          layer_count: s.layer_count,
          primary_color: s.primary_color ?? s.marker_color,
        })))
        setPickerLoading(false)

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
        setLoadedSites(loaded)
      })
      .catch(() => { setPickerLoading(false) })

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

  // Sidebar's Site-tab picker → fly the globe to the chosen pin and
  // then navigate (matches the "click a pin twice" affordance below
  // and the dropdown behaviour we just retired).
  const onSitePickerSelect = useCallback((slug: string) => {
    const site = sitesWithCamera.current.find(s => s.slug === slug)
    if (!site || !viewerRef.current || viewerRef.current.isDestroyed()) {
      navigateToSite(slug)
      return
    }
    flyToTarget(viewerRef.current, {
      longitude: site.longitude,
      latitude: site.latitude,
      height: 0,
      range: site.height ?? 800,
      duration: 1.5,
      onComplete: () => navigateToSite(slug),
    })
  }, [navigateToSite])

  // Legacy home_widget_* welcome content used to render inside
  // ViewerSidebar's Home tab. Phase 4 retired ViewerSidebar; the
  // overview pane now leads with the SiteStrip directly. The
  // home_widget settings are no longer surfaced on this route.
  void homeWidget // silence "set but unread" noise

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

  // CtrlPill camera handlers — drive the overview globe directly.
  const ctrlZoomIn = useCallback(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    v.camera.zoomIn(v.camera.positionCartographic.height * 0.35)
  }, [])
  const ctrlZoomOut = useCallback(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    v.camera.zoomOut(v.camera.positionCartographic.height * 0.5)
  }, [])
  // ctrlHome was the CtrlPill home button which is now retired per
  // spec; keeping the handler in case a future "reset view" affordance
  // shows up elsewhere. Marked with void to keep eslint quiet.
  const ctrlHome = useCallback(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    const cam = overviewCameraRef.current
    v.camera.flyTo({
      destination: Cartesian3.fromDegrees(cam.lon, cam.lat, cam.height),
      duration: 1.2,
    })
  }, [])
  void ctrlHome

  // Phase 4: no layout-reserving sidebar. FloatingIconStack overlays
  // the canvas; canvas is full-width.
  const sidebarWidth = 0

  // FloatingIconStack items for the overview pane. Search is a tool
  // toggle (defers to the existing SearchWidget infra — not mounted
  // here yet, so this is a TODO no-op stub on overview). Measure
  // toggles the measure tool inline.
  const overviewIconStackItems: FloatingIconStackItem[] = [
    {
      id: 'search',
      label: 'Search',
      icon: <SearchIcon size={18} />,
      hasPanel: false,
      onClick: () => { /* TODO: wire SearchWidget on overview route */ },
    },
    {
      id: 'measure',
      label: 'Measure',
      icon: <Ruler size={18} />,
      hasPanel: false,
      isActive: measureActive,
      onClick: () => {
        if (measureActive) cancelMeasure()
        else startMeasure()
      },
    },
  ]

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#0f0f14' }}>
      {/* Cesium canvas — full width; floating chrome overlays. */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Floating icon stack — Search + Measure for the overview pane. */}
      <div className={isMobile ? 'is-phone' : ''}>
        <FloatingIconStack
          items={overviewIconStackItems}
          activePanel={null}
          onTogglePanel={() => { /* no panels on overview */ }}
        />
      </div>

      {/* Primary controller pill — overview state ("All sites · N").
          Mounted directly on the page (not via MapShell) because the
          overview route owns its own globe layout. */}
      <div
        className={isMobile ? 'is-phone' : ''}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <CtrlPill
            currentSite={null}
            siteCount={loadedSites.length}
            brandName={branding.name}
            onZoomIn={ctrlZoomIn}
            onZoomOut={ctrlZoomOut}
            variant={isMobile ? 'pill' : 'bar'}
          />
        </div>
      </div>

      {/* Site list strip — replaces the (non-existent) widget rail at
          the bottom of the overview pane. Phone full-width; on desktop
          this wrapper centers the strip with max-width 960. Card click
          + pin click stay in sync via activeSiteSlug. */}
      {pickerSites.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 12 : 16,
            left: sidebarWidth,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            transition: 'left 0.2s ease',
            zIndex: 6,
          }}
        >
          <div style={{ width: '100%', maxWidth: isMobile ? 'none' : 960, pointerEvents: 'auto' }}>
            <SiteStrip
              sites={pickerSites}
              activeSiteSlug={selectedSlug}
              onSelectSite={onSitePickerSelect}
            />
          </div>
        </div>
      )}

      {/* "Zoom to" button — appears when a site pin is selected on
          the globe. Offset right so it sits inside the visible canvas. */}
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

      {/* Measure widget — measurement readout / clear button. The
          measure pick handler is owned by useMeasure; we just render
          the readout when active. */}
      <MeasureWidget
        measureActive={measureActive}
        measureRunning={measureRunning}
        measureResult={measureResult}
        measureMode={measureMode}
        onModeChange={setMeasureMode}
        onCleanup={cleanupMeasure}
        onClearResult={() => setMeasureResult(null)}
      />

      {/* Zoom-to splash (per-site config) — still a splash overlay,
          fires once when navigating into a site if the target site
          has zoom_splash_enabled. Distinct from the home widget; the
          home widget moved to the sidebar's Home tab. */}
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

