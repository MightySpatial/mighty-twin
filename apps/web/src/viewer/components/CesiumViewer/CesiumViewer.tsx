/**
 * MightyTwin — Cesium Viewer Component
 * Slim orchestrator — wires hooks + widgets together
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { SiteConfigState } from '../../types/api'
import { Cartesian3, Math as CesiumMath } from 'cesium'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { HelpCircle } from 'lucide-react'
import { getExtensionPanels } from '../../extensions'
import type { ViewerContext } from '../../extensions/types'
import type { CesiumViewerProps } from './types'
import { MapShell } from '../MapShell'
import {
  FeaturePopup,
  FeatureAttributesDrawer,
  useFeatureClick,
} from '../FeaturePopup'
import { SitePicker, pushRecentSite } from '../SitePicker'
import { useSites } from '../../hooks/useSites'
import { useNavigate } from 'react-router-dom'

import { useTokenFetch } from './hooks/useTokenFetch'
import { useCesiumMount } from './hooks/useCesiumMount'
import { useLayerSync } from './hooks/useLayerSync'
import { useSiteFocalPin } from './hooks/useSiteFocalPin'

import MeasureWidget, { useMeasure } from '../../widgets/measure'
import { SnapshotWidget } from '../../widgets/snapshot'
import BasemapWidget, { useBasemap } from '../../widgets/basemap'
import TransparencyWidget, { useGlobeTransparency } from '../../widgets/transparency'
import SearchWidget from '../../widgets/search'
import { LayersPanel } from '../../widgets/layers'
import LegendWidget from '../../widgets/legend'
import SplashOverlay from '../SplashOverlay/SplashOverlay'
import TetraView from '../TetraView/TetraView'
import ViewerSidebar from '../ViewerSidebar'

// Mobile-only floating layer panel
function MobileLayers({ layers, layersLoading, onLayerToggle, onLayerOpacityChange }: {
  layers: import('./types').Layer[]
  layersLoading?: boolean
  onLayerToggle?: (id: string) => void
  onLayerOpacityChange?: (id: string, opacity: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <LayersPanel
      layers={layers}
      loading={layersLoading}
      layerPanelOpen={open}
      setLayerPanelOpen={setOpen}
      isMobile={true}
      onLayerToggle={onLayerToggle}
      onLayerOpacityChange={onLayerOpacityChange}
    />
  )
}

import './CesiumViewer.css'

export default function CesiumViewerComponent({
  siteId,
  site,
  initialPosition = { longitude: 151.2093, latitude: -33.8688, height: 500000 },
  layers = [],
  layersLoading = false,
  onViewerReady,
  onLayerToggle,
  onLayerOpacityChange,
  onOpenStoryPicker,
  storyActive = false,
}: CesiumViewerProps) {
  const { isMobile } = useBreakpoint()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeExtPanel, setActiveExtPanel] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [siteConfigState, setSiteConfigState] = useState<SiteConfigState>({})
  const extensionPanels = useMemo(() => getExtensionPanels(), [])
  const [infoWidgetOpen, setInfoWidgetOpen] = useState(false)
  const [tetraActive, setTetraActive] = useState(false)
  const [zoomSplashOpen, setZoomSplashOpen] = useState(false)
  const zoomSplashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [is2D, setIs2D] = useState(false)

  // Zoom-to splash: show once per session per site after 3s delay
  useEffect(() => {
    if (zoomSplashTimerRef.current) {
      clearTimeout(zoomSplashTimerRef.current)
      zoomSplashTimerRef.current = null
    }
    setZoomSplashOpen(false)

    if (!site?.overlay_config?.zoom_splash_enabled || !site.slug) return
    const key = `zoom_splash_${site.slug}`
    if (sessionStorage.getItem(key) === 'shown') return

    zoomSplashTimerRef.current = setTimeout(() => {
      setZoomSplashOpen(true)
      sessionStorage.setItem(key, 'shown')
    }, 3000)

    return () => {
      if (zoomSplashTimerRef.current) clearTimeout(zoomSplashTimerRef.current)
    }
  }, [site?.slug, site?.overlay_config?.zoom_splash_enabled])

  // Core hooks
  const tokenReady = useTokenFetch()
  const { viewerRef, containerRef } = useCesiumMount(
    tokenReady,
    initialPosition,
    onViewerReady,
    () => {
      cleanupMeasure()
    },
  )
  const { imgMapRef } = useLayerSync(viewerRef, layers, siteId, siteConfigState, setSiteConfigState)
  useSiteFocalPin(viewerRef, site)

  // Widget hooks
  const {
    measureActive, measureRunning, measureResult,
    startMeasure, cleanupMeasure, setMeasureResult,
  } = useMeasure(viewerRef)
  const { activeBasemap, basemapOpen, setBasemapOpen, switchBasemap } = useBasemap(viewerRef, imgMapRef)
  const { globeAlpha, setGlobeAlpha, transparencyOpen, setTransparencyOpen } = useGlobeTransparency(viewerRef)

  // Keyboard shortcuts: ESC closes active panel, L toggles layers, M activates measure
  const closeActivePanel = useCallback(() => {
    if (measureActive) { cleanupMeasure(); return }
    if (measureResult) { cleanupMeasure(); setMeasureResult(null); return }
    if (searchOpen) { setSearchOpen(false); return }
    if (activeExtPanel) { setActiveExtPanel(null); return }
    if (basemapOpen) { setBasemapOpen(false); return }
    if (transparencyOpen) { setTransparencyOpen(false); return }
    if (legendOpen) { setLegendOpen(false); return }
    if (sidebarOpen) { setSidebarOpen(false); return }
  }, [measureActive, measureResult, searchOpen, activeExtPanel, basemapOpen, transparencyOpen, legendOpen, sidebarOpen, cleanupMeasure, setMeasureResult, setBasemapOpen, setTransparencyOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case 'Escape':
          closeActivePanel()
          break
        case 'l':
        case 'L':
          setSidebarOpen(prev => !prev)
          break
        case 'm':
        case 'M':
          if (!measureActive) startMeasure()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeActivePanel, measureActive, startMeasure])

  // Camera controls (stable references to avoid child re-renders)
  const flyHome = useCallback(() => {
    viewerRef.current?.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        initialPosition.longitude,
        initialPosition.latitude,
        initialPosition.height
      ),
    })
  }, [viewerRef, initialPosition.longitude, initialPosition.latitude, initialPosition.height])
  const zoomIn = useCallback(() => {
    const h = viewerRef.current?.camera.positionCartographic.height ?? 10000
    viewerRef.current?.camera.zoomIn(h * 0.4)
  }, [viewerRef])
  const zoomOut = useCallback(() => {
    const h = viewerRef.current?.camera.positionCartographic.height ?? 10000
    viewerRef.current?.camera.zoomOut(h * 0.4)
  }, [viewerRef])

  // 2D/3D toggle. Cesium's morphTo* animates the transition; we keep
  // local UI state in sync so the button shows the *target* mode (icon
  // reflects what clicking will give you).
  const toggleSceneMode = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (is2D) {
      viewer.scene.morphTo3D(1.0)
      setIs2D(false)
    } else {
      viewer.scene.morphTo2D(1.0)
      setIs2D(true)
    }
  }, [viewerRef, is2D])

  // Camera-heading + reset, used by the new nav gimbal in MapShell.
  // Guard against viewer destroy: cesium throws when accessing .scene
  // after destroy() so we keep our own listener-handle and try/catch
  // cleanup. Re-runs whenever the viewer ref is set up (post-mount).
  const [headingDeg, setHeadingDeg] = useState(0)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let scene
    try {
      scene = viewer.scene
    } catch {
      return
    }
    if (!scene) return
    const onPostRender = () => {
      try {
        const h = CesiumMath.toDegrees(viewer.camera.heading)
        setHeadingDeg((prev) => (Math.abs(prev - h) > 0.5 ? h : prev))
      } catch {
        /* viewer destroyed mid-render */
      }
    }
    scene.postRender.addEventListener(onPostRender)
    return () => {
      try {
        scene.postRender.removeEventListener(onPostRender)
      } catch {
        /* scene already disposed */
      }
    }
  }, [viewerRef.current])

  const resetCamera = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const c = viewer.camera
    const cart = c.positionCartographic
    c.flyTo({
      destination: Cartesian3.fromRadians(cart.longitude, cart.latitude, cart.height),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: 0.8,
    })
  }, [])

  // Site picker — popover from the MapShell site chip.
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { sites: pickerSites, loading: pickerLoading } = useSites()
  useEffect(() => {
    if (siteId) pushRecentSite(siteId)
  }, [siteId])

  // Feature click → popup → drawer.
  const { picked, anchor, clear: clearPicked } = useFeatureClick(viewerRef)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    if (!picked) setDrawerOpen(false)
  }, [picked])
  const zoomToPicked = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !picked) return
    try {
      viewer.flyTo(picked.entity, { duration: 0.8 })
    } catch {
      /* entity may not have a flyable bounding sphere */
    }
  }, [picked, viewerRef])

  // Snapshot widget — opens via Snap rail tile.
  const [snapOpen, setSnapOpen] = useState(false)

  // Map MapShell action ids → existing widget state. Tools that aren't
  // implemented yet (design/table/story/strike) toggle a placeholder
  // state we can wire later without ripping the rail apart.
  const [comingSoon, setComingSoon] = useState<string | null>(null)
  useEffect(() => {
    if (!comingSoon) return
    const t = setTimeout(() => setComingSoon(null), 2400)
    return () => clearTimeout(t)
  }, [comingSoon])

  const activeToolId = useMemo<string | null>(() => {
    if (searchOpen) return 'search'
    if (measureActive) return 'measure'
    if (sidebarOpen && !isMobile) return 'layers'
    if (legendOpen) return 'legend'
    if (transparencyOpen) return 'terrain'
    if (snapOpen) return 'snap'
    if (storyActive) return 'story'
    if (basemapOpen) return null  // basemap lives in zoom column, not bottom rail
    return null
  }, [searchOpen, measureActive, sidebarOpen, isMobile, legendOpen, transparencyOpen, snapOpen, storyActive, basemapOpen])

  const onMapShellAction = useCallback((id: string) => {
    switch (id) {
      case 'search':
        setSearchOpen((o) => !o); break
      case 'measure':
        measureActive ? cleanupMeasure() : startMeasure(); break
      case 'layers':
        setSidebarOpen((o) => !o); break
      case 'legend':
        setLegendOpen((o) => !o); break
      case 'terrain':
        setTransparencyOpen((o) => !o); break
      case 'snap':
        setSnapOpen(true); break
      case 'story':
        if (onOpenStoryPicker) onOpenStoryPicker()
        else setComingSoon(id)
        break
      case 'design':
      case 'table':
      case 'strike':
        setComingSoon(id); break
      default: break
    }
  }, [measureActive, cleanupMeasure, startMeasure, onOpenStoryPicker])

  // Sidebar width: tab rail (48px) + content panel (280px) when open
  const sidebarWidth = !isMobile && sidebarOpen ? 328 : !isMobile ? 48 : 0

  return (
    <div className="cesium-container">
      {/* Sidebar — docked left on desktop */}
      {!isMobile && (
        <ViewerSidebar
          layers={layers}
          layersLoading={layersLoading}
          onLayerToggle={onLayerToggle}
          onLayerOpacityChange={onLayerOpacityChange}
          extensionPanels={extensionPanels}
          activeExtPanel={activeExtPanel}
          setActiveExtPanel={setActiveExtPanel}
          viewer={viewerRef.current}
          siteId={siteId ?? ''}
          siteConfigState={siteConfigState}
          setSiteConfigState={setSiteConfigState}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          isMobile={isMobile}
        />
      )}

      {/* Cesium canvas — offset by sidebar width */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: 0,
          bottom: 0,
          transition: 'left 0.2s ease',
        }}
      />

      {/* Search */}
      <SearchWidget viewerRef={viewerRef} searchOpen={searchOpen} setSearchOpen={setSearchOpen} />

      {/* New chrome — MapShell renders site chip / zoom column / nav
          gimbal / bottom widget rails. Wraps inside a sidebar-aware
          container so it doesn't fight the existing left sidebar. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          transition: 'left 0.2s ease',
        }}
      >
        <MapShell
          site={site ? { slug: siteId ?? '', name: site.name, subtitle: site.description ?? undefined } : null}
          activeToolId={activeToolId}
          onAction={onMapShellAction}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onHome={flyHome}
          onToggle2D3D={toggleSceneMode}
          onToggleBasemap={() => setBasemapOpen((o) => !o)}
          onResetCamera={resetCamera}
          onOpenSitePicker={() => setPickerOpen((o) => !o)}
          headingDeg={headingDeg}
          is2D={is2D}
          phoneMode={isMobile}
        />
      </div>

      {/* Site picker — popover from MapShell site chip. Rendered inside
          the sidebar-aware frame so it doesn't bleed under the left
          sidebar on desktop. */}
      {pickerOpen && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: sidebarWidth,
            right: 0,
            bottom: 0,
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <SitePicker
              sites={pickerSites}
              currentSlug={siteId ?? null}
              loading={pickerLoading}
              onClose={() => setPickerOpen(false)}
              onSelect={(slug) => {
                pushRecentSite(slug)
                setPickerOpen(false)
                navigate(`/sites/${slug}`)
              }}
            />
          </div>
        </div>
      )}

      {/* Feature click — leader-line popup near the picked feature, full
          attribute drawer on demand. Wraps inside the sidebar-aware
          frame so the popup tracks the visible canvas, not the off-screen
          left strip. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          transition: 'left 0.2s ease',
        }}
      >
        {picked && !drawerOpen && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
            <FeaturePopup
              picked={picked}
              anchor={anchor}
              isMobile={isMobile}
              onClose={clearPicked}
              onOpenDrawer={() => setDrawerOpen(true)}
            />
          </div>
        )}
        {picked && drawerOpen && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
            <FeatureAttributesDrawer
              picked={picked}
              isMobile={isMobile}
              onClose={() => {
                setDrawerOpen(false)
                clearPicked()
              }}
              onZoomTo={zoomToPicked}
            />
          </div>
        )}
      </div>

      {/* Site-info trigger (lives outside MapShell because it's
          conditional on overlay_config). Rendered as a small floating
          chip top-right of the bottom rails. */}
      {site?.overlay_config?.info_widget_enabled && (
        <button
          className="map-control-btn"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 18,
            zIndex: 5,
          }}
          onClick={() => setInfoWidgetOpen(true)}
          title="Site Info"
        >
          <HelpCircle size={18} />
        </button>
      )}

      {/* Extension panels — mobile renders launcher icons in a strip */}
      {isMobile && extensionPanels.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 90,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 5,
          }}
        >
          {extensionPanels.map((ep) => (
            <button
              key={ep.id}
              className={`map-control-btn${activeExtPanel === ep.id ? ' active' : ''}`}
              title={ep.label}
              onClick={() => setActiveExtPanel((p) => (p === ep.id ? null : ep.id))}
            >
              {ep.icon}
            </button>
          ))}
        </div>
      )}

      {/* "Coming soon" toast for not-yet-wired secondary widgets */}
      {comingSoon && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 110,
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(17,20,29,0.95)',
            border: '1px solid rgba(245,158,11,0.32)',
            borderRadius: 999,
            color: '#f59e0b',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            boxShadow: '0 4px 14px rgba(0,0,0,0.32)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {comingSoon} · landing soon
        </div>
      )}

      {/* Panels */}
      {basemapOpen && <BasemapWidget activeBasemap={activeBasemap} switchBasemap={switchBasemap} />}
      {transparencyOpen && <TransparencyWidget globeAlpha={globeAlpha} setGlobeAlpha={setGlobeAlpha} onClose={() => setTransparencyOpen(false)} />}

      {/* Measure */}
      <MeasureWidget
        measureActive={measureActive}
        measureRunning={measureRunning}
        measureResult={measureResult}
        onCleanup={cleanupMeasure}
        onClearResult={() => setMeasureResult(null)}
      />

      {/* Legend */}
      {legendOpen && <LegendWidget layers={layers} onClose={() => setLegendOpen(false)} />}

      {/* Mobile: legacy floating layers panel */}
      {isMobile && <MobileLayers
        layers={layers}
        layersLoading={layersLoading}
        onLayerToggle={onLayerToggle}
        onLayerOpacityChange={onLayerOpacityChange}
      />}

      {/* Mobile: floating extension panel */}
      {isMobile && activeExtPanel && viewerRef.current && (() => {
        const ep = extensionPanels.find(p => p.id === activeExtPanel)
        if (!ep) return null
        const ctx: ViewerContext = {
          siteId: siteId ?? '',
          getSiteConfig: (key) => siteConfigState[key],
          setSiteConfig: (key, val) => setSiteConfigState(prev => ({ ...prev, [key]: val })),
        }
        const PanelComponent = ep.component
        return (
          <div className="ext-panel-container">
            <PanelComponent
              viewer={viewerRef.current!}
              context={ctx}
              onClose={() => setActiveExtPanel(null)}
            />
          </div>
        )
      })()}

      {/* Info Widget Overlay */}
      {infoWidgetOpen && site?.overlay_config?.info_widget_enabled && (
        <SplashOverlay
          title={site.overlay_config.info_widget_title ?? 'Site Info'}
          message={site.overlay_config.info_widget_content ?? ''}
          onDismiss={() => setInfoWidgetOpen(false)}
        />
      )}

      {/* Zoom-to Splash Overlay */}
      {zoomSplashOpen && site?.overlay_config?.zoom_splash_enabled && (
        <SplashOverlay
          title={site.overlay_config.zoom_splash_title ?? 'Welcome'}
          message={site.overlay_config.zoom_splash_content ?? ''}
          autoDismissSecs={site.overlay_config.zoom_splash_auto_dismiss_secs}
          onDismiss={() => setZoomSplashOpen(false)}
        />
      )}

      {/* Tetra View */}
      {tetraActive && viewerRef.current && (
        <TetraView viewer={viewerRef.current} onClose={() => setTetraActive(false)} />
      )}

      {/* Snapshot capture modal */}
      {snapOpen && (
        <SnapshotWidget
          viewerRef={viewerRef}
          siteSlug={siteId ?? null}
          layers={layers.map((l) => ({
            id: l.id,
            visible: l.visible ?? true,
            opacity: l.opacity ?? 1,
          }))}
          isMobile={isMobile}
          onClose={() => setSnapOpen(false)}
        />
      )}
    </div>
  )
}
