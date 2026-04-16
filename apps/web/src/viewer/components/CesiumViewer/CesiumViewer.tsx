/**
 * MightyTwin — Cesium Viewer Component
 * Slim orchestrator — wires hooks + widgets together
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { SiteConfigState } from '../../types/api'
import { Cartesian3 } from 'cesium'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import {
  Home, ZoomIn, ZoomOut, Map as MapIcon, Search, Ruler, Mountain, ListTree, HelpCircle, Hexagon,
} from 'lucide-react'
import { getExtensionPanels } from '../../extensions'
import type { ViewerContext } from '../../extensions/types'
import type { CesiumViewerProps } from './types'

import { useTokenFetch } from './hooks/useTokenFetch'
import { useCesiumMount } from './hooks/useCesiumMount'
import { useLayerSync } from './hooks/useLayerSync'
import { useSiteFocalPin } from './hooks/useSiteFocalPin'

import MeasureWidget, { useMeasure } from '../../widgets/measure'
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

      {/* Map Controls */}
      <div className="map-controls">
        <button className="map-control-btn" onClick={() => setSearchOpen(s => !s)} title="Search"><Search size={18} /></button>
        <button className="map-control-btn" onClick={flyHome} title="Home"><Home size={18} /></button>
        <div className="map-controls-divider" />
        <button className="map-control-btn" onClick={zoomIn} title="Zoom In"><ZoomIn size={18} /></button>
        <button className="map-control-btn" onClick={zoomOut} title="Zoom Out"><ZoomOut size={18} /></button>
        <div className="map-controls-divider" />
        <button className={`map-control-btn${measureActive ? ' active' : ''}`} onClick={startMeasure} title="Measure (M)"><Ruler size={18} /></button>
        <button className={`map-control-btn${transparencyOpen ? ' active' : ''}`} onClick={() => setTransparencyOpen(s => !s)} title="Globe Transparency"><Mountain size={18} /></button>
        <button className="map-control-btn" onClick={() => setBasemapOpen(s => !s)} title="Basemap"><MapIcon size={18} /></button>
        <button className={`map-control-btn${legendOpen ? ' active' : ''}`} onClick={() => setLegendOpen(s => !s)} title="Legend"><ListTree size={18} /></button>
        <button className={`map-control-btn${tetraActive ? ' active' : ''}`} onClick={() => setTetraActive(s => !s)} title="Tetra View"><Hexagon size={18} /></button>
        {site?.overlay_config?.info_widget_enabled && (
          <button className={`map-control-btn${infoWidgetOpen ? ' active' : ''}`} onClick={() => setInfoWidgetOpen(true)} title="Site Info"><HelpCircle size={18} /></button>
        )}
        {/* Extension panel buttons — only shown on mobile (desktop uses sidebar tabs) */}
        {isMobile && extensionPanels.length > 0 && <div className="map-controls-divider" />}
        {isMobile && extensionPanels.map(ep => (
          <button
            key={ep.id}
            className={`map-control-btn${activeExtPanel === ep.id ? ' active' : ''}`}
            title={ep.label}
            onClick={() => setActiveExtPanel(p => p === ep.id ? null : ep.id)}
          >
            {ep.icon}
          </button>
        ))}
      </div>

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
    </div>
  )
}
