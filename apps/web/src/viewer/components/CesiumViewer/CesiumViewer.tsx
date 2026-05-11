/**
 * MightyTwin — Cesium Viewer Component
 * Slim orchestrator — wires hooks + widgets together
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { SiteConfigState } from '../../types/api'
import { Cartesian3, CameraEventType, Math as CesiumMath } from 'cesium'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useWidgetLayout } from '../../hooks/useWidgetLayout'
import { HelpCircle, Search as SearchIcon, Ruler, List as LegendIcon } from 'lucide-react'
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
import FlyWidget from '../../widgets/fly/FlyWidget'
import { useSplatRenderer } from './hooks/useSplatRenderer'
import {
  useFlyMode,
  useGearShift,
  type FlySpeed,
} from './hooks/useFlyMode'

import MeasureWidget, { useMeasure } from '../../widgets/measure'
import { SnapshotWidget } from '../../widgets/snapshot'
import { AttributeTableWidget } from '../../widgets/attribute-table'
import { StrikeWidget, useStrike } from '../../widgets/strike'
import { TerrainWidget, useTerrain, useUnderground } from '../../widgets/terrain'
import { flyToTarget } from '../../utils/flyToTarget'
import BasemapWidget, { useBasemap } from '../../widgets/basemap'
import TransparencyWidget, { useGlobeTransparency } from '../../widgets/transparency'
import SearchWidget from '../../widgets/search'
import { LayersPanel } from '../../widgets/layers'
import LegendWidget from '../../widgets/legend'
import SplashOverlay from '../SplashOverlay/SplashOverlay'
import TetraView from '../TetraView/TetraView'
import ViewerSidebar from '../ViewerSidebar'
import { DesignWidget } from '../../widgets/design'
import { RightPane, type RightPaneTabId } from '../RightPane'

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

import { useMaiDock } from '../../../ai/MaiContext'
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
  const widgetOverrides = useWidgetLayout()
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
  // Real Gaussian-splat rendering on top of Cesium. Hook is no-op when
  // there are no splat layers — adds an overlay canvas + per-frame
  // camera sync only when needed. Falls back silently to the
  // volumetric-box marker drawn by useLayerSync if WebGL2 is
  // unavailable or a splat fails to load.
  useSplatRenderer(viewerRef, layers)
  useSiteFocalPin(viewerRef, site)

  // Widget hooks
  const {
    measureActive, measureRunning, measureResult,
    startMeasure, cancelMeasure, cleanupMeasure, setMeasureResult,
  } = useMeasure(viewerRef)
  const { activeBasemap, basemapOpen, setBasemapOpen, switchBasemap } = useBasemap(viewerRef, imgMapRef)
  const { globeAlpha, setGlobeAlpha, transparencyOpen, setTransparencyOpen } = useGlobeTransparency(viewerRef)

  // Keyboard shortcuts: ESC closes active panel, L toggles layers, M activates measure
  const closeActivePanel = useCallback(() => {
    if (measureActive) { cancelMeasure(); return }
    if (measureResult) { cleanupMeasure(); setMeasureResult(null); return }
    if (searchOpen) { setSearchOpen(false); return }
    if (activeExtPanel) { setActiveExtPanel(null); return }
    if (basemapOpen) { setBasemapOpen(false); return }
    if (transparencyOpen) { setTransparencyOpen(false); return }
    if (legendOpen) { setLegendOpen(false); return }
    if (sidebarOpen) { setSidebarOpen(false); return }
  }, [measureActive, measureResult, searchOpen, activeExtPanel, basemapOpen, transparencyOpen, legendOpen, sidebarOpen, cancelMeasure, cleanupMeasure, setMeasureResult, setBasemapOpen, setTransparencyOpen])

  const closeDesign = useCallback(() => {
    setDesignOpen(false)
    window.dispatchEvent(new CustomEvent('design:close'))
  }, [])

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

  // Camera controls (stable references to avoid child re-renders).
  // flyHome uses the bounding-sphere pattern via flyToTarget so the
  // user lands looking AT the home target at a tilted 45° from
  // initialPosition.height range, rather than standing on the address
  // staring past it.
  const flyHome = useCallback(() => {
    flyToTarget(viewerRef.current, {
      longitude: initialPosition.longitude,
      latitude: initialPosition.latitude,
      height: 0,
      range: initialPosition.height,
      headingDeg: initialPosition.heading ?? 0,
      pitchDeg: initialPosition.pitch ?? -45,
    })
  }, [
    viewerRef,
    initialPosition.longitude,
    initialPosition.latitude,
    initialPosition.height,
    initialPosition.heading,
    initialPosition.pitch,
  ])
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

  // Camera capture for cross-tab editor flows (StoryMaps "Capture from
  // viewer"). Writes the live camera to localStorage every ~500ms
  // throttled, scoped to the active site slug. The Atlas editor reads
  // this and pulls coords back into the slide form.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !siteId) return
    let scene
    try {
      scene = viewer.scene
    } catch {
      return
    }
    if (!scene) return
    let lastWrite = 0
    const onPost = () => {
      const now = Date.now()
      if (now - lastWrite < 500) return
      lastWrite = now
      try {
        const cam = viewer.camera
        const cart = cam.positionCartographic
        if (!cart) return
        const payload = {
          longitude: CesiumMath.toDegrees(cart.longitude),
          latitude: CesiumMath.toDegrees(cart.latitude),
          height: cart.height,
          heading: CesiumMath.toDegrees(cam.heading),
          pitch: CesiumMath.toDegrees(cam.pitch),
          roll: CesiumMath.toDegrees(cam.roll),
          ts: now,
        }
        localStorage.setItem(`mighty:viewer-cam:${siteId}`, JSON.stringify(payload))
      } catch {
        /* viewer mid-destroy or quota exhausted */
      }
    }
    scene.postRender.addEventListener(onPost)
    return () => {
      try {
        scene.postRender.removeEventListener(onPost)
      } catch {
        /* scene already gone */
      }
    }
  }, [viewerRef.current, siteId])

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

  // Fly-through camera mode (formerly "walk"). Off by default; the
  // toolbar exposes a play/stop control + sequential gear shifter.
  // Activation toggles WASD/arrow locomotion — see useFlyMode.
  const [flyActive, setFlyActive] = useState(false)
  const [flySpeed, setFlySpeed] = useState<FlySpeed>('cycling')
  const onGearShift = useGearShift(setFlySpeed, flySpeed)
  useFlyMode({ viewerRef, active: flyActive, speed: flySpeed, onGearShift })

  // Auto-exit fly mode when the user navigates away from the viewer
  // surface — otherwise WASD still moves the (unmounted) camera.
  useEffect(() => {
    if (!flyActive) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setFlyActive(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [flyActive])

  // Look-around mode: hold compass → first-person free-look (camera
  // pivots on its own lens, position stays still — like Ctrl+drag in
  // a 3D modeller), release anywhere → restore orbit.
  //
  // Cesium's "look" gesture is bound to RIGHT_DRAG by default, so just
  // flipping enableLook does nothing for a user who's left-dragging.
  // We rebind the gesture types so left-drag maps to look while held,
  // and snapshot the originals to restore on release. Rotate + tilt
  // are dropped from the gesture set so they don't fight the look.
  const [lookAroundActive, setLookAroundActive] = useState(false)
  const toggleLookAround = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const ctrl = viewer.scene.screenSpaceCameraController
    const prev = {
      enableRotate: ctrl.enableRotate,
      enableTilt: ctrl.enableTilt,
      enableLook: ctrl.enableLook,
      rotateEventTypes: ctrl.rotateEventTypes,
      tiltEventTypes: ctrl.tiltEventTypes,
      lookEventTypes: ctrl.lookEventTypes,
    }
    ctrl.enableRotate = false
    ctrl.enableTilt = false
    ctrl.enableLook = true
    // Drop rotate + tilt from any bound gestures so they don't fight
    // the look mode (a stray default tilt on middle-drag would still
    // move the eye otherwise).
    ctrl.rotateEventTypes = []
    ctrl.tiltEventTypes = []
    // Bind look to BOTH left-drag and right-drag so any pointer the
    // user is holding pivots the lens. Touch goes through left-drag too.
    ctrl.lookEventTypes = [CameraEventType.LEFT_DRAG, CameraEventType.RIGHT_DRAG]
    setLookAroundActive(true)
    // Single window pointerup restores orbit mode + the original
    // gesture bindings.
    const stop = () => {
      try {
        ctrl.enableRotate = prev.enableRotate
        ctrl.enableTilt = prev.enableTilt
        ctrl.enableLook = prev.enableLook
        ctrl.rotateEventTypes = prev.rotateEventTypes
        ctrl.tiltEventTypes = prev.tiltEventTypes
        ctrl.lookEventTypes = prev.lookEventTypes
      } catch { /* viewer may have been destroyed */ }
      setLookAroundActive(false)
    }
    window.addEventListener('pointerup', stop, { once: true })
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

  // Attribute table — opens via Table rail tile (T+1080).
  const [tableOpen, setTableOpen] = useState(false)

  // Strike widget — opens via Strike rail tile (T+1110).
  const [strikeOpen, setStrikeOpen] = useState(false)
  const strike = useStrike(viewerRef)

  // Terrain section — opens via Terrain rail tile (T+1170). Folds the
  // existing globe-transparency knob into a tab inside the same panel.
  const [terrainOpen, setTerrainOpen] = useState(false)
  const terrain = useTerrain(viewerRef)
  const underground = useUnderground(viewerRef, globeAlpha, setGlobeAlpha)

  // Design widget — right-side overlay (was a sidebar tab). Dispatches
  // design:open / design:close on the window so the AI ChatPanel can
  // minimise itself out of the way.
  //
  // Also: respect ?widget=design (and optional &tool=building) on first
  // mount so admin "Sketch with the wizard" links land on the right
  // panel without an extra click. Cleared from the URL after consuming
  // so a refresh doesn't re-open the panel forever.
  const [designOpen, setDesignOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('widget') === 'design'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('widget') === 'design') {
      const tool = params.get('tool')
      if (tool === 'building') {
        // Surface the building tab via a window event the widget reads
        // on mount. Keeps the deep-link contract one-way without
        // wiring tab state through props.
        window.dispatchEvent(
          new CustomEvent('design:request-tab', { detail: { tab: 'building' } }),
        )
      }
      params.delete('widget')
      params.delete('tool')
      const remaining = params.toString()
      const url =
        window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash
      window.history.replaceState(null, '', url)
    }
  }, [])

  // Signal to Mai that a panel is open → it docks at the bottom of the sidebar.
  // Include all widget panels that open floating overlays so Mai doesn't overlap them.
  const { setDocked } = useMaiDock()
  useEffect(() => {
    const anyPanelOpen = sidebarOpen || designOpen || terrainOpen || strikeOpen ||
      snapOpen || tableOpen || legendOpen || transparencyOpen || storyActive
    setDocked(!isMobile && anyPanelOpen)
  }, [sidebarOpen, designOpen, terrainOpen, strikeOpen, snapOpen, tableOpen,
      legendOpen, transparencyOpen, storyActive, isMobile, setDocked])

  // ── Right pane (desktop only) ─────────────────────────────────────
  // The pane is the single home for Story / Snap / Design / Strike /
  // Terrain. We derive the active tab from the existing per-widget
  // open states so the rest of the file (activeToolId memo, Mai dock,
  // ESC handlers) keeps working unchanged. Switching tabs clears
  // every other state then sets the picked one.
  const [storyTabActive, setStoryTabActive] = useState(false)
  const activeRightTab = useMemo<RightPaneTabId | null>(() => {
    if (designOpen) return 'design'
    if (snapOpen) return 'snap'
    if (strikeOpen) return 'strike'
    if (terrainOpen) return 'terrain'
    if (storyTabActive) return 'story'
    return null
  }, [designOpen, snapOpen, strikeOpen, terrainOpen, storyTabActive])
  const onRightTabChange = useCallback((next: RightPaneTabId) => {
    setDesignOpen(next === 'design')
    setSnapOpen(next === 'snap')
    setStrikeOpen(next === 'strike')
    setTerrainOpen(next === 'terrain')
    setStoryTabActive(next === 'story')
    // Design widget dispatches open/close window events so the AI
    // ChatPanel docks out of the way — keep that behaviour even when
    // the tab change comes from the pane rather than the old rail.
    if (next === 'design') {
      window.dispatchEvent(new CustomEvent('design:open'))
    } else {
      window.dispatchEvent(new CustomEvent('design:close'))
    }
    // Story tab still hands off to the external picker, matching the
    // pre-rearchitecture behaviour. The pane shows a placeholder
    // until/unless we land an inline story player later.
    if (next === 'story' && onOpenStoryPicker) onOpenStoryPicker()
  }, [onOpenStoryPicker])

  // Map MapShell action ids → existing widget state. Tools that aren't
  // implemented yet (table/story/strike) toggle a placeholder
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
    if (terrainOpen) return 'terrain'
    if (snapOpen) return 'snap'
    if (tableOpen) return 'table'
    if (strikeOpen) return 'strike'
    if (storyActive) return 'story'
    if (designOpen) return 'design'
    if (flyActive) return 'fly'
    if (storyTabActive) return 'story'
    if (basemapOpen) return null  // basemap lives in zoom column, not bottom rail
    return null
  }, [searchOpen, measureActive, sidebarOpen, isMobile, legendOpen, transparencyOpen, terrainOpen, snapOpen, tableOpen, strikeOpen, storyActive, storyTabActive, basemapOpen, designOpen, flyActive])

  const onMapShellAction = useCallback((id: string) => {
    switch (id) {
      case 'search':
        setSearchOpen((o) => !o); break
      case 'measure':
        // cancelMeasure resets React state (measureActive=false) AND cleans
        // up entities/handlers. cleanupMeasure alone left React state stale,
        // which kept the toggle stuck on after a tap-to-disable.
        measureActive ? cancelMeasure() : startMeasure(); break
      case 'layers':
        setSidebarOpen((o) => !o); break
      case 'legend':
        setLegendOpen((o) => !o); break
      case 'table':
        // Table moved to the primary controller but still drawer-mounted.
        setTableOpen(true); break
      // ── Secondary widgets — route through the right pane on desktop ──
      // On mobile the pane isn't mounted, so we fall through to the
      // legacy per-widget open state and the floating wrappers below.
      case 'snap':
        if (isMobile) setSnapOpen(true)
        else onRightTabChange(activeRightTab === 'snap' ? 'snap' : 'snap')
        break
      case 'strike':
        if (isMobile) setStrikeOpen((o) => !o)
        else onRightTabChange('strike')
        break
      case 'terrain':
        if (isMobile) {
          setTerrainOpen((o) => o ? false : true)
        } else {
          onRightTabChange('terrain')
        }
        break
      case 'story':
        if (isMobile) {
          if (onOpenStoryPicker) onOpenStoryPicker()
          else setComingSoon(id)
        } else {
          onRightTabChange('story')
        }
        break
      case 'design':
        if (isMobile) {
          setDesignOpen(prev => {
            const next = !prev
            window.dispatchEvent(new CustomEvent(next ? 'design:open' : 'design:close'))
            return next
          })
        } else {
          onRightTabChange('design')
        }
        break
      case 'fly':
        setFlyActive((a) => !a)
        break
      default: break
    }
  }, [measureActive, cancelMeasure, startMeasure, onOpenStoryPicker, isMobile, onRightTabChange, activeRightTab])

  // Sidebar width: tab rail (64px) + content panel (280px) when open
  const sidebarWidth = !isMobile && sidebarOpen ? 344 : !isMobile ? 64 : 0
  // Right pane width — fixed 320px on desktop, 0 on mobile (mobile
  // keeps the legacy floating widget overlays until the mobile PR
  // lands a slide-in pane).
  const rightPaneWidth = !isMobile ? 320 : 0

  // Terrain panel rendered inline for the sidebar
  const terrainSidebarPanel = terrainOpen ? (
    <TerrainWidget
      sidebarMode
      status={terrain.status}
      pickedCount={terrain.pickedCount}
      section={terrain.section}
      error={terrain.error}
      isMobile={isMobile}
      globeAlpha={globeAlpha}
      onSetGlobeAlpha={setGlobeAlpha}
      onStart={terrain.start}
      onStartFromLine={terrain.startFromLine}
      onCancel={terrain.cancel}
      onClear={terrain.clear}
      onHoverSample={terrain.setCursor}
      viewerRef={viewerRef}
      underground={underground.state}
      onUndergroundEnable={underground.enable}
      onUndergroundDisable={underground.disable}
      onUndergroundSet={underground.set}
      onUndergroundReset={underground.reset}
      onClose={() => {
        terrain.clear()
        setTerrainOpen(false)
      }}
    />
  ) : null

  return (
    <div className="cesium-container">
      {/* Sidebar — left rail on both desktop (full) and mobile (rail-only,
          positioned below topBar). Camera controls live here on both sizes. */}
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
        terrainPanel={isMobile ? terrainSidebarPanel : null}
        terrainTabActive={isMobile && terrainOpen}
        onTerrainTabClick={isMobile ? (() => setTerrainOpen(o => !o)) : undefined}
        activeWidgetId={activeToolId}
        onWidgetTabClick={onMapShellAction}
        site={site ? { slug: siteId ?? '', name: site.name } : null}
        pickerSites={!isMobile ? pickerSites : []}
        pickerLoading={pickerLoading}
        homeContent={site?.home_content ?? null}
        onOpenSitePicker={() => setPickerOpen(o => !o)}
      />

      {/* Cesium canvas — offset by sidebar (left) + right pane (right) */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: rightPaneWidth,
          bottom: 0,
          transition: 'left 0.2s ease, right 0.2s ease',
        }}
      />

      {/* Search */}
      <SearchWidget viewerRef={viewerRef} searchOpen={searchOpen} setSearchOpen={setSearchOpen} />

      {/* New chrome — MapShell renders site chip / zoom column / nav
          gimbal / bottom widget rails. Wraps inside a frame that's
          aware of both the left sidebar and the right pane so its
          chrome doesn't slide under either. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: rightPaneWidth,
          bottom: 0,
          pointerEvents: 'none',
          transition: 'left 0.2s ease, right 0.2s ease',
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
          onToggleLookAround={toggleLookAround}
          lookAroundActive={lookAroundActive}
          onOpenSitePicker={() => setPickerOpen((o) => !o)}
          headingDeg={headingDeg}
          is2D={is2D}
          phoneMode={isMobile}
          widgetOverrides={widgetOverrides}
        />
      </div>

      {/* Fly widget — mobile only as a floating MiniPlayer. Desktop
          users see Fly inside the right pane's bottom zone (always
          visible). */}
      {flyActive && isMobile && (
        <FlyWidget
          speed={flySpeed}
          setSpeed={setFlySpeed}
          onClose={() => setFlyActive(false)}
          isMobile={isMobile}
        />
      )}

      {/* Site picker — popover from MapShell site chip. Rendered inside
          the sidebar-aware frame so it doesn't bleed under the left
          sidebar on desktop. */}
      {pickerOpen && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: sidebarWidth,
            right: rightPaneWidth,
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
              isMobile={isMobile}
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
          left strip. Also offset by the right pane width on desktop. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: sidebarWidth,
          right: rightPaneWidth,
          bottom: 0,
          pointerEvents: 'none',
          transition: 'left 0.2s ease, right 0.2s ease',
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
              siteSlug={siteId ?? null}
              isMobile={isMobile}
              onClose={() => {
                setDrawerOpen(false)
                clearPicked()
              }}
              onZoomTo={zoomToPicked}
              onChanged={(next) => {
                if (next === null) {
                  // feature deleted — entity will be removed by the
                  // layer reload that ViewerPage triggers on navigate
                  setDrawerOpen(false)
                  clearPicked()
                }
                // attribute updates: the next click will re-pick fresh
                // from the GeoJsonDataSource (which is reloaded by
                // useLayerSync on URL/visibility changes); for now we
                // close + reopen the drawer fresh on the next click.
              }}
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
      {basemapOpen && (
        // Sidebar-aware wrapper so the panel anchors below the topBar's
        // basemap button (left: 14px) inside the visible canvas, not under
        // the desktop sidebar. Mobile uses a fullscreen scrim and ignores
        // this offset.
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: isMobile ? 0 : sidebarWidth,
            right: rightPaneWidth,
            bottom: 0,
            zIndex: 25,
            pointerEvents: 'none',
            transition: 'left 0.2s ease, right 0.2s ease',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <BasemapWidget
              activeBasemap={activeBasemap}
              switchBasemap={switchBasemap}
              onClose={() => setBasemapOpen(false)}
              isMobile={isMobile}
            />
          </div>
        </div>
      )}
      {/* Globe-transparency lives inside the Terrain panel as a tab; the
          legacy standalone widget is kept for Esc-close compatibility
          but isn't reachable from the rail anymore. */}
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

      {/* Mobile: floating layers panel (layer-toggle-btn at top: 60px) */}
      {isMobile && <MobileLayers
        layers={layers}
        layersLoading={layersLoading}
        onLayerToggle={onLayerToggle}
        onLayerOpacityChange={onLayerOpacityChange}
      />}

      {/* Mobile: primary tool buttons — Search, Measure, Legend stacked
          below the Layers button, same floating pill style. */}
      {isMobile && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <button
            className={`mobile-tool-btn${searchOpen ? ' mobile-tool-btn--active' : ''}`}
            style={{ pointerEvents: 'auto', top: 110 }}
            onClick={() => setSearchOpen(o => !o)}
            title="Search"
          >
            <SearchIcon size={20} />
          </button>
          <button
            className={`mobile-tool-btn${measureActive ? ' mobile-tool-btn--active' : ''}`}
            style={{ pointerEvents: 'auto', top: 160 }}
            onClick={() => measureActive ? cancelMeasure() : startMeasure()}
            title="Measure"
          >
            <Ruler size={20} />
          </button>
          <button
            className={`mobile-tool-btn${legendOpen ? ' mobile-tool-btn--active' : ''}`}
            style={{ pointerEvents: 'auto', top: 210 }}
            onClick={() => setLegendOpen(o => !o)}
            title="Legend"
          >
            <LegendIcon size={20} />
          </button>
        </div>
      )}

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

      {/* Snapshot capture modal — mobile only; desktop renders in the
          right pane via inline mode below. */}
      {snapOpen && isMobile && (
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

      {/* Attribute table modal — wraps the shared AttributeTable with a
          layer picker so users land on the right rows for the active site. */}
      {tableOpen && siteId && (
        <AttributeTableWidget
          siteSlug={siteId}
          siteName={site?.name}
          layers={layers}
          isMobile={isMobile}
          onClose={() => setTableOpen(false)}
        />
      )}

      {/* Strike & dip — mobile only; desktop renders in the right pane. */}
      {strikeOpen && isMobile && (
        <StrikeWidget
          active={strike.active}
          pickedCount={strike.picked.length}
          measurement={strike.measurement}
          isMobile={isMobile}
          onStart={strike.start}
          onCancel={strike.cancel}
          onClear={strike.clear}
          onClose={() => {
            strike.clear()
            setStrikeOpen(false)
          }}
        />
      )}

      {/* Design widget — mobile floating overlay only. Desktop renders
          inline inside the right pane (see RightPane render at the
          bottom of this file). ChatPanel listens for design:open /
          design:close window events to minimise itself out of the way. */}
      {designOpen && isMobile && viewerRef.current && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 420,
            zIndex: 50,
            background: 'rgba(18, 22, 30, 0.97)',
            backdropFilter: 'blur(12px)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
            animation: 'slideInRight 200ms ease',
          }}
        >
          <button
            onClick={closeDesign}
            title="Close"
            aria-label="Close design"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 1,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 18,
            }}
          >
            ✕
          </button>
          <DesignWidget
            viewer={viewerRef.current}
            onClose={closeDesign}
            siteSlug={siteId ?? null}
          />
        </div>
      )}

      {/* Terrain widget — mobile only; desktop version lives in the sidebar */}
      {terrainOpen && isMobile && (
        <TerrainWidget
          status={terrain.status}
          pickedCount={terrain.pickedCount}
          section={terrain.section}
          error={terrain.error}
          isMobile={isMobile}
          globeAlpha={globeAlpha}
          onSetGlobeAlpha={setGlobeAlpha}
          onStart={terrain.start}
          onStartFromLine={terrain.startFromLine}
          onCancel={terrain.cancel}
          onClear={terrain.clear}
          onHoverSample={terrain.setCursor}
          viewerRef={viewerRef}
          underground={underground.state}
          onUndergroundEnable={underground.enable}
          onUndergroundDisable={underground.disable}
          onUndergroundSet={underground.set}
          onUndergroundReset={underground.reset}
          onClose={() => {
            terrain.clear()
            setTerrainOpen(false)
          }}
        />
      )}

      {/* ── Right pane (desktop only) ─────────────────────────────────
          Always visible at right edge. Hosts Story / Snap / Design /
          Strike / Terrain as tab content + Fly in the fixed bottom
          zone. Mobile keeps the legacy floating overlays for these
          widgets until the mobile slide-in pane lands in a follow-up. */}
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: rightPaneWidth,
            zIndex: 30,
          }}
        >
          <RightPane
            activeTab={activeRightTab}
            onTabChange={onRightTabChange}
            tabContent={{
              story: (
                <div style={{ padding: 16, fontSize: 12, color: 'rgba(230,237,243,0.6)', lineHeight: 1.5 }}>
                  {/* Story still hands off to an external picker today
                      (no in-pane player wired). The pane tab acts as
                      the entry point; the actual story workflow opens
                      in its own modal via onOpenStoryPicker. */}
                  <p style={{ margin: 0 }}>Pick a story to play.</p>
                  {onOpenStoryPicker && (
                    <button
                      type="button"
                      onClick={onOpenStoryPicker}
                      style={{
                        marginTop: 12,
                        padding: '6px 12px',
                        background: 'rgba(37,99,235,0.16)',
                        border: '1px solid rgba(37,99,235,0.3)',
                        borderRadius: 6,
                        color: '#60a5fa',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Open story picker
                    </button>
                  )}
                </div>
              ),
              snap: (
                <SnapshotWidget
                  viewerRef={viewerRef}
                  siteSlug={siteId ?? null}
                  layers={layers.map((l) => ({
                    id: l.id,
                    visible: l.visible ?? true,
                    opacity: l.opacity ?? 1,
                  }))}
                  isMobile={false}
                  onClose={() => setSnapOpen(false)}
                  mode="inline"
                />
              ),
              design: viewerRef.current ? (
                <DesignWidget
                  viewer={viewerRef.current}
                  onClose={closeDesign}
                  siteSlug={siteId ?? null}
                  mode="inline"
                />
              ) : (
                <div style={{ padding: 16, fontSize: 12, color: 'rgba(230,237,243,0.4)' }}>
                  Loading globe…
                </div>
              ),
              strike: (
                <StrikeWidget
                  active={strike.active}
                  pickedCount={strike.picked.length}
                  measurement={strike.measurement}
                  isMobile={false}
                  onStart={strike.start}
                  onCancel={strike.cancel}
                  onClear={strike.clear}
                  onClose={() => {
                    strike.clear()
                    setStrikeOpen(false)
                  }}
                  mode="inline"
                />
              ),
              terrain: terrainSidebarPanel ?? (
                <div style={{ padding: 16, fontSize: 12, color: 'rgba(230,237,243,0.4)' }}>
                  Terrain idle.
                </div>
              ),
            }}
            bottomZone={
              <FlyWidget
                speed={flySpeed}
                setSpeed={setFlySpeed}
                onClose={() => setFlyActive(false)}
                isMobile={false}
                mode="inline"
                active={flyActive}
                onToggleActive={() => setFlyActive((a) => !a)}
              />
            }
          />
        </div>
      )}
    </div>
  )
}

