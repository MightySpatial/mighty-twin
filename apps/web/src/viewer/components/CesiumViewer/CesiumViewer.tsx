/**
 * MightyTwin — Cesium Viewer Component
 * Slim orchestrator — wires hooks + widgets together
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { SiteConfigState } from '../../types/api'
import { Cartesian3, CameraEventType, Math as CesiumMath } from 'cesium'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useWidgetLayout } from '../../hooks/useWidgetLayout'
import { useFloatingPanels } from '../../hooks/useFloatingPanels'
import { useLegendDock } from '../../hooks/useLegendDock'
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
  type FlyTouchIntent,
} from './hooks/useFlyMode'
import { useFlyTouchGestures } from './hooks/useFlyTouchGestures'
import FlyMiniPlayer from '../../widgets/fly/FlyMiniPlayer'

import MeasureWidget, { useMeasure } from '../../widgets/measure'
import type { MeasureMode } from '../../widgets/measure'
import { SnapshotWidget } from '../../widgets/snapshot'
import { AttributeTableWidget } from '../../widgets/attribute-table'
import { TerrainWidget, useTerrain, useTerrainMask, useUnderground } from '../../widgets/terrain'
import { useSvoEngine } from '../../widgets/design/voxel/useSvoEngine'
import { voxelLayerMaskRing } from '../../widgets/design/voxel/svoOps'
import { AddDataWidget } from '../../widgets/add-data'
import { useCadEngine } from '../../widgets/design/sketch/useCadEngine'
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
import { RightPane } from '../RightPane'

type ActiveRightWidget = 'story' | 'snap' | 'design' | 'terrain' | 'measure' | null

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
  /** Shared utility-panel coordinator. Table / Add Data share a
   *  single-active slot; opening one auto-closes whichever was
   *  previously active. MAI, Fly, and Legend are exempt — they each
   *  have their own independent state. Derived booleans
   *  `addDataOpen` / `tableOpen` keep the existing call-site reads
   *  unchanged. */
  const floatingPanel = useFloatingPanels(s => s.active)
  const togglePanel = useFloatingPanels(s => s.toggle)
  const openPanel = useFloatingPanels(s => s.open)
  const addDataOpen = floatingPanel === 'add-data'
  const tableOpen = floatingPanel === 'table'

  // Legend dock state — when docked the LegendWidget mounts inside
  // the sidebar (handled by ViewerSidebar). When undocked it renders
  // as a floating draggable panel from this component. The rail tab
  // toggles collapsed when docked / docks back when undocked, so the
  // user always has a way to bring the legend home.
  const legendDocked = useLegendDock(s => s.docked)
  const toggleLegendCollapsed = useLegendDock(s => s.toggleCollapsed)
  const dockLegend = useLegendDock(s => s.dock)
  /** Active sketch id — passed to AddDataWidget so the "Add to
   *  current sketch" destination knows which sketch to tag uploads
   *  with. Read from useCadEngine here rather than threading through
   *  every child. */
  const activeSketchIdForUpload = useCadEngine(s => s.activeSketchId)
  const [searchOpen, setSearchOpen] = useState(false)
  /** Mobile legend visibility — phones have no sidebar so the legend
   *  is always a tap-to-reveal overlay. Keeps its own toggle so it
   *  doesn't fight the desktop dock state. */
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false)
  const [activeExtPanel, setActiveExtPanel] = useState<string | null>(null)
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
    measureMode, setMeasureMode,
    measureActive, measureRunning, measureResult,
    startMeasure, cancelMeasure, cleanupMeasure, setMeasureResult,
  } = useMeasure(viewerRef)

  /** Tab handler shared by the floating tooltip and the inline right-
   *  pane control. Switching modes always restarts measurement in the
   *  newly chosen mode — setMeasureMode synchronously cancels any
   *  in-progress work and clears any displayed result, so startMeasure
   *  begins from a clean slate using the new mode's ref. */
  const onMeasureModeChange = useCallback((next: MeasureMode) => {
    setMeasureMode(next)
    startMeasure()
  }, [setMeasureMode, startMeasure])
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
    // Legend is no longer transient — it's a sidebar fixture (or a
    // floating popup the user explicitly undocked). ESC intentionally
    // doesn't dismiss it; the user controls dock/undock + collapse
    // via the legend's own header controls.
    if (sidebarOpen) { setSidebarOpen(false); return }
  }, [measureActive, measureResult, searchOpen, activeExtPanel, basemapOpen, transparencyOpen, sidebarOpen, cancelMeasure, cleanupMeasure, setMeasureResult, setBasemapOpen, setTransparencyOpen])

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
  // Mobile touch intent — populated by useFlyTouchGestures, read by
  // useFlyMode's per-tick loop alongside keyboard state. The ref is
  // stable so both hooks see the same object.
  const flyTouchIntentRef = useRef<FlyTouchIntent>({
    forward: 0, right: 0, up: 0, yaw: 0, pitch: 0,
  })
  useFlyMode({
    viewerRef,
    active: flyActive,
    speed: flySpeed,
    onGearShift,
    touchIntentRef: flyTouchIntentRef,
  })
  useFlyTouchGestures({
    viewerRef,
    intentRef: flyTouchIntentRef,
    active: isMobile && flyActive,
    onGearShift,
  })

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

  // Attribute table — opens via Table sidebar tab. `tableOpen` is
  // derived from useFloatingPanels above so it shares the single-
  // active-utility-panel slot with Legend and Add Data.


  // Terrain section — opens via Terrain rail tile (T+1170). Folds the
  // existing globe-transparency knob into a tab inside the same panel.
  const [terrainOpen, setTerrainOpen] = useState(false)
  const terrain = useTerrain(viewerRef)
  const underground = useUnderground(viewerRef, globeAlpha, setGlobeAlpha)

  // Terrain mask — owned at the viewer level so both the Terrain
  // widget's Mask tab and the design widget can hand polygons to the
  // same scene-side clipping state. Persists across tab/widget
  // switches; cleared explicitly via mask.clear().
  const terrainMask = useTerrainMask(viewerRef)
  const svoChunks = useSvoEngine(s => s.chunks)
  const svoActiveLayerId = useSvoEngine(s => s.activeLayerId)
  const svoActiveLevel = useSvoEngine(s => s.activeLevel)
  const svoLayers = useSvoEngine(s => s.layers)
  const svoActiveLayer = useMemo(
    () => svoLayers.find(l => l.id === svoActiveLayerId) ?? null,
    [svoLayers, svoActiveLayerId],
  )
  const hasVoxelBounds = useMemo(() => {
    if (!svoActiveLayer) return false
    const ring = voxelLayerMaskRing(svoChunks, svoActiveLayer.id, svoActiveLevel, svoActiveLayer.datum)
    return ring !== null
  }, [svoChunks, svoActiveLayer, svoActiveLevel])
  const onUseVoxelAsMask = useCallback(() => {
    if (!svoActiveLayer) return
    const ring = voxelLayerMaskRing(svoChunks, svoActiveLayer.id, svoActiveLevel, svoActiveLayer.datum)
    if (!ring) return
    terrainMask.setMaskFromPositions(ring, 'voxel')
  }, [svoChunks, svoActiveLayer, svoActiveLevel, terrainMask])

  /** Persist the active mask to the site's config so every future
   *  viewer load applies it automatically. Backend already accepts
   *  `config: dict[str, Any]` on PATCH, so no migration is needed —
   *  the polygon lives under a new `terrain_mask_geojson` key. */
  const onSaveMaskAsSiteDefault = useCallback(async () => {
    if (!siteId) return
    if (terrainMask.state.kind !== 'set') return
    const payload = {
      terrain_mask_geojson: {
        type: 'Polygon' as const,
        positions: terrainMask.state.positions,
        source: terrainMask.state.source,
        saved_at: new Date().toISOString(),
      },
    }
    try {
      const r = await fetch(`/api/spatial/sites/${encodeURIComponent(siteId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}`,
        },
        body: JSON.stringify({ config: payload }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      // Mirror into local site config so the next viewer paint matches
      // the persisted state — avoids the next-refresh flash.
      setSiteConfigState(prev => ({ ...prev, terrain_mask_geojson: payload.terrain_mask_geojson }))
    } catch (e) {
      console.error('Save terrain mask failed', e)
    }
  }, [siteId, terrainMask.state])

  // Apply the site-config-default terrain mask once per site load.
  // Admins set this in the SiteDetailPage; viewers see the mask
  // applied automatically on first render. We only set it when the
  // mask is currently idle so we don't clobber a user-drawn mask
  // mid-session.
  const siteMaskApplied = useRef<string | null>(null)
  useEffect(() => {
    if (!siteId) return
    if (siteMaskApplied.current === siteId) return
    siteMaskApplied.current = siteId
    const saved = (siteConfigState?.terrain_mask_geojson as unknown) as
      | { positions?: Array<{ longitude: number; latitude: number }> }
      | undefined
    if (saved?.positions && saved.positions.length >= 3 && terrainMask.state.kind === 'idle') {
      terrainMask.setMaskFromPositions(saved.positions, 'site')
    }
  }, [siteId, siteConfigState, terrainMask])

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
    // Legend is intentionally excluded — it lives in the sidebar by
    // default (already covered by sidebarOpen) and its undocked
    // floating variant anchors bottom-left, away from MAI's bottom-
    // right home position.
    const measurePane = !isMobile && (measureActive || !!measureResult)
    const anyPanelOpen = sidebarOpen || designOpen || terrainOpen ||
      snapOpen || tableOpen || transparencyOpen || storyActive ||
      measurePane
    setDocked(!isMobile && !!anyPanelOpen)
  }, [sidebarOpen, designOpen, terrainOpen, snapOpen, tableOpen,
      transparencyOpen, storyActive, isMobile, setDocked,
      measureActive, measureResult])

  // ── Right pane (desktop only) ─────────────────────────────────────
  // The pane has no controller of its own — it just shows whichever
  // secondary widget is currently active. The trigger for setting that
  // active widget lives in the bottom-rail SecondaryRail (Story /
  // Snap / Design / Terrain / Fly). Toggling clears every other
  // secondary state. Fly is a special case — clicking the tile opens
  // the Fly panel in the pane but doesn't auto-activate locomotion;
  // the user toggles ON/OFF inside the panel.
  const [storyTabActive, setStoryTabActive] = useState(false)
  // flyPanelOpen toggles a free-floating Fly popup (bottom-right of
  // the viewport). It is NOT a right-pane widget — Rahman wanted Fly
  // simplified back to a plain floating panel separate from the
  // pane/rail content swap dance. Clicking the FLY tile in the
  // bottom rail toggles this state directly.
  //
  // The popup auto-activates fly mode on open (and deactivates on
  // close) — there's no separate "OFF" state in the popup chrome.
  // The starting gear is chosen from the camera's altitude so a
  // continental overview opens in Jet, a 1:1 splat walk-through
  // opens in Walk, etc.
  const [flyPanelOpen, setFlyPanelOpen] = useState(false)
  useEffect(() => {
    if (!flyPanelOpen) {
      setFlyActive(false)
      return
    }
    const viewer = viewerRef.current
    if (viewer) {
      let h = 0
      try {
        h = viewer.camera.positionCartographic?.height ?? 0
      } catch {
        // Viewer may not be fully initialised on the very first open.
      }
      let gear: FlySpeed = 'walk'
      if (h >= 50000) gear = 'jet'
      else if (h >= 5000) gear = 'gliding'
      else if (h >= 500) gear = 'driving'
      else if (h >= 50) gear = 'cycling'
      setFlySpeed(gear)
    }
    setFlyActive(true)
  }, [flyPanelOpen])
  const activeRightWidget = useMemo<ActiveRightWidget>(() => {
    if (designOpen) return 'design'
    if (snapOpen) return 'snap'
    if (terrainOpen) return 'terrain'
    if (storyTabActive) return 'story'
    // Measure uses the right-pane controller on desktop only. On
    // mobile the floating tooltip + result panel already cover the
    // touch surface and routing through the drawer would just
    // duplicate the same controls.
    if (!isMobile && (measureActive || measureResult)) return 'measure'
    return null
  }, [designOpen, snapOpen, terrainOpen, storyTabActive, measureActive, measureResult, isMobile])
  const setActiveRightWidget = useCallback((next: ActiveRightWidget) => {
    setDesignOpen(next === 'design')
    setSnapOpen(next === 'snap')
    setTerrainOpen(next === 'terrain')
    setStoryTabActive(next === 'story')
    // Measure ↔ right-pane sync: activating 'measure' starts a fresh
    // measurement in the current mode; switching to any other right
    // widget cancels measure so the pane releases cleanly.
    if (next === 'measure') {
      if (!measureActive) startMeasure()
    } else if (measureActive || measureResult) {
      cancelMeasure()
    }
    // Design widget dispatches open/close window events so the AI
    // ChatPanel docks out of the way — keep that behaviour even when
    // the selection comes from the rail rather than a sidebar tab.
    if (next === 'design') {
      window.dispatchEvent(new CustomEvent('design:open'))
    } else {
      window.dispatchEvent(new CustomEvent('design:close'))
    }
    // Story tab still hands off to the external picker, matching the
    // pre-rearchitecture behaviour. The pane shows a placeholder
    // until/unless we land an inline story player later.
    if (next === 'story' && onOpenStoryPicker) onOpenStoryPicker()
  }, [onOpenStoryPicker, measureActive, measureResult, startMeasure, cancelMeasure])
  /** Sidebar widget-tab click handler: toggle if same, else set. */
  const onSidebarWidgetTabToggle = useCallback((id: ActiveRightWidget) => {
    setActiveRightWidget(activeRightWidget === id ? null : id)
  }, [activeRightWidget, setActiveRightWidget])

  // Tell the rest of the chrome (DraggableMai, FlyWidget) when the
  // right pane is open. MAI shifts left, the floating Fly popup
  // shifts left — both listen via the body.rp-open class + window
  // events without threading state through their parents.
  useEffect(() => {
    const open = activeRightWidget !== null && !isMobile
    if (open) {
      document.body.classList.add('rp-open')
      window.dispatchEvent(new CustomEvent('mighty:rp-open'))
    } else {
      document.body.classList.remove('rp-open')
      window.dispatchEvent(new CustomEvent('mighty:rp-close'))
    }
  }, [activeRightWidget, isMobile])

  // Mobile drawer state for the right pane. Auto-opens whenever the
  // user activates a secondary widget on mobile, and auto-closes
  // whenever fly mode is on (the canvas needs the touch surface).
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false)
  useEffect(() => {
    if (!isMobile) return
    if (flyActive) {
      setRightDrawerOpen(false)
      return
    }
    if (activeRightWidget) setRightDrawerOpen(true)
  }, [isMobile, activeRightWidget, flyActive])

  // Map MapShell action ids → existing widget state. Tools that aren't
  // fully implemented yet (table/story) toggle a placeholder state we
  // can wire later without ripping the rail apart.
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
    // Legend is a fixture, not a transient tool — no rail highlight.
    // Visible state is conveyed by the body showing/hiding inside the
    // sidebar (docked) or the floating panel appearing (undocked).
    if (terrainOpen) return 'terrain'
    if (snapOpen) return 'snap'
    if (tableOpen) return 'table'
    if (storyActive) return 'story'
    if (designOpen) return 'design'
    // Highlight Fly when the panel is open OR locomotion is engaged
    // — covers both "panel parked open while parked" and the gear-
    // active state after the user toggled ON.
    if (flyPanelOpen || flyActive) return 'fly'
    if (storyTabActive) return 'story'
    if (basemapOpen) return null  // basemap lives in zoom column, not bottom rail
    return null
  }, [searchOpen, measureActive, sidebarOpen, isMobile, transparencyOpen, terrainOpen, snapOpen, tableOpen, storyActive, storyTabActive, basemapOpen, designOpen, flyActive, flyPanelOpen])

  const onMapShellAction = useCallback((id: string) => {
    switch (id) {
      case 'search':
        setSearchOpen((o) => !o); break
      case 'measure':
        // Desktop routes Measure through the right-pane controller so
        // it picks up the inline tab UI (Line / Area / Point) like the
        // other secondary widgets. Mobile keeps the floating tooltip
        // path — the drawer would just duplicate the same controls.
        if (isMobile) {
          if (measureActive || measureResult) {
            cancelMeasure()
          } else {
            startMeasure()
          }
        } else {
          setActiveRightWidget(
            (measureActive || measureResult) ? null : 'measure',
          )
        }
        break
      case 'layers':
        setSidebarOpen((o) => !o); break
      case 'legend':
        // Legend is a sidebar fixture, not a utility popup. The rail
        // tab toggles its collapsed state when docked; when the user
        // has popped it out into floating mode, the tab snaps it
        // back home (and expands it) so they can always find it.
        // Sidebar must be open for the docked body to be visible —
        // expand it if collapsed so the action has feedback.
        if (legendDocked) {
          if (!sidebarOpen) setSidebarOpen(true)
          toggleLegendCollapsed()
        } else {
          dockLegend()
          if (!sidebarOpen) setSidebarOpen(true)
        }
        break
      case 'table':
        togglePanel('table'); break
      // ── Secondary widgets — route through the right pane on desktop ──
      // On mobile the pane isn't mounted, so we fall through to the
      // legacy per-widget open state and the floating wrappers below.
      // Story / Snap / Design / Terrain — all flow through the right
      // pane on both desktop (docked) and mobile (drawer). The drawer
      // open state is auto-driven from activeRightWidget by an
      // effect, so we don't need a mobile-specific branch here.
      case 'snap':
        setActiveRightWidget(activeRightWidget === 'snap' ? null : 'snap')
        break
      case 'terrain':
        setActiveRightWidget(activeRightWidget === 'terrain' ? null : 'terrain')
        break
      case 'story':
        setActiveRightWidget(activeRightWidget === 'story' ? null : 'story')
        break
      case 'design':
        setActiveRightWidget(activeRightWidget === 'design' ? null : 'design')
        break
      case 'fly':
        // Rail click toggles the free-floating Fly popup. It lives
        // outside the right-pane content slot — Rahman explicitly
        // wanted Fly reverted to a plain pop-out so it doesn't get
        // tangled with the Story / Snap / Design / Terrain swap
        // dance. The popup's internal ON/OFF pill still gates
        // locomotion (flyActive); just opening the popup doesn't
        // engage the camera.
        setFlyPanelOpen(o => !o)
        break
      default: break
    }
  }, [measureActive, measureResult, cancelMeasure, startMeasure, onOpenStoryPicker, isMobile, setActiveRightWidget, activeRightWidget, legendDocked, sidebarOpen, toggleLegendCollapsed, dockLegend])

  // Sidebar width: tab rail (64px) + content panel (280px) when open
  const sidebarWidth = !isMobile && sidebarOpen ? 344 : !isMobile ? 64 : 0
  // Right pane width — fixed 320px on desktop, 0 on mobile (mobile
  // keeps the legacy floating widget overlays until the mobile PR
  // lands a slide-in pane).
  // Right pane is a content slot — it only takes width when a
  // secondary widget is open. When idle the canvas reclaims the full
  // viewport width and the bottom rail centres on the whole canvas.
  // Mobile uses the drawer overlay path so the pane never occupies
  // layout width there.
  const rightPaneWidth = (!isMobile && activeRightWidget) ? 320 : 0

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
      mask={terrainMask}
      hasVoxelBounds={hasVoxelBounds}
      onUseVoxelAsMask={onUseVoxelAsMask}
      onSaveMaskAsSiteDefault={onSaveMaskAsSiteDefault}
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
        addDataOpen={addDataOpen}
        onToggleAddData={() => togglePanel('add-data')}
        autocollapseDelayMs={
          // Convert site.config.sidebar_autocollapse_delay (seconds)
          // → ms. null = never auto-collapse; otherwise default to
          // 3s when unset so the affordance exists out of the box.
          site?.sidebar_autocollapse_delay === null
            ? null
            : (site?.sidebar_autocollapse_delay ?? 3) * 1000
        }
        onOpenSitePicker={() => setPickerOpen(o => !o)}
      />

      {/* Add Data panel — floats next to the sidebar (or on top on
          mobile). Mounted at the viewer-root level so it sits above
          the canvas chrome but below the AI FAB (z-index 8000). */}
      {addDataOpen && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: sidebarWidth + 12,
            zIndex: 7000,
          }}
        >
          <AddDataWidget
            onClose={() => openPanel(null)}
            siteSlug={siteId ?? null}
            activeSketchId={activeSketchIdForUpload ?? null}
          />
        </div>
      )}

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
          onNavigateOverview={() => navigate('/viewer')}
        />
      </div>

      {/* Desktop floating Fly popup — opened via the FLY tile in
          the bottom rail. Lives outside the right-pane content slot
          so toggling Story / Snap / Design / Terrain doesn't yank
          Fly with them. CSS pins the panel to the bottom-right of
          the canvas above MAI; the existing FlyWidget `floating`
          mode owns the shifter + key legend. */}
      {!isMobile && flyPanelOpen && (
        <FlyWidget
          speed={flySpeed}
          setSpeed={setFlySpeed}
          onClose={() => setFlyPanelOpen(false)}
          isMobile={false}
          mode="floating"
          active={flyActive}
        />
      )}

      {/* Mobile fly bar — only visible when locomotion is engaged
          (canvas gestures take over and the user wants a quick
          gear / OFF readout). */}
      {isMobile && flyActive && (
        <FlyMiniPlayer
          speed={flySpeed}
          active={flyActive}
          onShift={onGearShift}
          onToggleActive={() => setFlyActive(a => !a)}
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

      {/* Measure — floating overlay. On desktop we hand the UI off to
          the right pane (see the RightPane render below) once measure
          is the active right widget; mobile keeps the floating layout
          because the pane is a drawer that can be closed. */}
      {(isMobile || activeRightWidget !== 'measure') && (
        <MeasureWidget
          mode="floating"
          measureMode={measureMode}
          onModeChange={onMeasureModeChange}
          measureActive={measureActive}
          measureRunning={measureRunning}
          measureResult={measureResult}
          onCleanup={cleanupMeasure}
          onClearResult={() => setMeasureResult(null)}
        />
      )}

      {/* Legend — desktop floating variant. The docked variant mounts
          inside ViewerSidebar. LegendWidget reads useLegendDock to
          decide which mode to render in; this mount only fires when
          the user has explicitly undocked it on desktop. */}
      {!isMobile && !legendDocked && <LegendWidget layers={layers} />}
      {/* Legend — mobile overlay. Phones have no sidebar dock target,
          so the legend is always a floating tap-to-reveal overlay;
          forceMode pins it to the floating variant regardless of the
          desktop dock store. */}
      {isMobile && mobileLegendOpen && (
        <LegendWidget
          layers={layers}
          forceMode="floating"
          onClose={() => setMobileLegendOpen(false)}
        />
      )}

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
            className={`mobile-tool-btn${mobileLegendOpen ? ' mobile-tool-btn--active' : ''}`}
            style={{ pointerEvents: 'auto', top: 210 }}
            onClick={() => setMobileLegendOpen(o => !o)}
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
          onClose={() => openPanel(null)}
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
          mask={terrainMask}
          hasVoxelBounds={hasVoxelBounds}
          onUseVoxelAsMask={onUseVoxelAsMask}
          onClose={() => {
            terrain.clear()
            setTerrainOpen(false)
          }}
        />
      )}

      {/* ── Right pane ─────────────────────────────────────────────
          Hosts whichever secondary widget the user activates from the
          bottom rail (Story / Snap / Design / Terrain / Fly). Desktop:
          docked 320px column, hidden entirely when nothing is active
          so the canvas reclaims the space. Mobile: 85vw drawer that
          slides in from the right edge. No always-pinned widget — the
          pane is a content slot, the bottom rail is the controller. */}
      {activeRightWidget !== null && (() => {
        const bodyLabel = activeRightWidget === 'story' ? 'Story'
          : activeRightWidget === 'snap' ? 'Snap'
          : activeRightWidget === 'design' ? 'Design'
          : activeRightWidget === 'terrain' ? 'Terrain'
          : activeRightWidget === 'measure' ? 'Measure'
          : null
        const body = activeRightWidget === 'story' ? (
          <div style={{ padding: 16, fontSize: 12, color: 'rgba(230,237,243,0.6)', lineHeight: 1.5 }}>
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
        )
        : activeRightWidget === 'snap' ? (
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
            mode="inline"
          />
        )
        : activeRightWidget === 'design' ? (
          viewerRef.current ? (
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
          )
        )
        : activeRightWidget === 'terrain' ? (
          terrainSidebarPanel ?? (
            <div style={{ padding: 16, fontSize: 12, color: 'rgba(230,237,243,0.4)' }}>
              Terrain idle.
            </div>
          )
        )
        : activeRightWidget === 'measure' ? (
          <MeasureWidget
            mode="inline"
            measureMode={measureMode}
            onModeChange={onMeasureModeChange}
            measureActive={measureActive}
            measureRunning={measureRunning}
            measureResult={measureResult}
            onCleanup={cleanupMeasure}
            onClearResult={() => setMeasureResult(null)}
          />
        )
        : null

        if (isMobile) {
          return (
            <RightPane
              mode="drawer"
              drawerOpen={rightDrawerOpen}
              onDrawerClose={() => {
                setRightDrawerOpen(false)
                // Closing the drawer also clears the active widget so
                // reopening starts from a known state (and the
                // bottom-rail tile highlight goes off).
                setActiveRightWidget(null)
              }}
              bodyLabel={bodyLabel}
              body={body}
            />
          )
        }

        return (
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
              bodyLabel={bodyLabel}
              body={body}
            />
          </div>
        )
      })()}
    </div>
  )
}

