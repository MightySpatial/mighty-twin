/**
 * MightyTwin — Viewer Page
 * Main 3D viewer with site-specific configuration.
 * Loads site + layers from the real /api/spatial API.
 */
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import CesiumViewer from '../components/CesiumViewer'
import StoryMapPlayer, { StoryMap } from '../components/StoryMapPlayer'
import { Menu, X, AlertCircle, Loader, BookOpen, ChevronDown, Globe } from 'lucide-react'
import { Viewer as CesiumViewerType } from 'cesium'
import { authFetch } from '../utils/authFetch'
import { useSites } from '../hooks/useSites'
import { useSite } from '../hooks/useSite'
import { useStoryMaps } from '../hooks/useStoryMaps'
import { useToast } from '../hooks/useToast'
import SlideMenu from './SlideMenu'
import StoryPicker from './StoryPicker'
import './ViewerPage.css'

const API_URL = import.meta.env.VITE_API_URL || ''

interface CameraPosition {
  longitude: number
  latitude: number
  height: number
  heading?: number
  pitch?: number
  roll?: number
}

// ─── Layer visibility toggle ──────────────────────────────────────────────────

async function toggleLayer(siteSlug: string, layerId: string, visible: boolean) {
  const res = await authFetch(`${API_URL}/api/spatial/sites/${siteSlug}/layers/${layerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible }),
  })
  if (!res.ok) throw new Error('Toggle failed')
}

// ─── Component ────────────────────────────────────────────────────────────────

const DEFAULT_CAMERA: CameraPosition = {
  longitude: 151.2093,
  latitude: -33.8688,
  height: 50000,
}

export default function ViewerPage() {
  const { siteSlug } = useParams<{ siteSlug?: string }>()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({})
  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({})
  const cesiumViewerRef = useRef<CesiumViewerType | null>(null)

  // Story maps
  const storyMaps = useStoryMaps(siteSlug)
  const [storyPickerOpen, setStoryPickerOpen] = useState(false)
  const [activeStoryMap, setActiveStoryMap] = useState<StoryMap | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  const { addToast } = useToast()
  const { sites } = useSites()
  const { site, loading, error } = useSite(siteSlug)

  // Sync local layer visibility state when site loads
  useEffect(() => {
    if (site?.layers) {
      const init: Record<string, boolean> = {}
      const initOp: Record<string, number> = {}
      site.layers.forEach(l => { init[l.id] = l.visible; initOp[l.id] = l.opacity ?? 1 })
      setLayerStates(init)
      setLayerOpacities(initOp)
    }
  }, [site])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleLayerToggle = async (layerId: string) => {
    if (!siteSlug) return
    const newVisible = !layerStates[layerId]
    setLayerStates(prev => ({ ...prev, [layerId]: newVisible }))
    try {
      await toggleLayer(siteSlug, layerId, newVisible)
    } catch {
      addToast('error', 'Failed to update layer visibility')
      setLayerStates(prev => ({ ...prev, [layerId]: !newVisible }))
    }
  }

  const handleLayerOpacity = (layerId: string, opacity: number) => {
    setLayerOpacities(prev => ({ ...prev, [layerId]: opacity }))
    if (siteSlug) {
      authFetch(`${API_URL}/api/spatial/sites/${siteSlug}/layers/${layerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opacity }),
      }).catch(() => {
        addToast('error', 'Failed to save layer opacity')
      })
    }
  }

  // Build layers list with local visibility overrides (memoized to avoid re-renders)
  const viewerLayers = useMemo(
    () => (site?.layers ?? []).map(l => ({
      ...l,
      url: l.url ?? (l.layer_metadata?.url as string | undefined),
      visible: layerStates[l.id] ?? l.visible,
      opacity: layerOpacities[l.id] ?? l.opacity ?? 1,
    })),
    [site?.layers, layerStates, layerOpacities],
  )

  const handleVisibleLayersChange = useCallback((visibleIds: string[]) => {
    if (!site?.layers) return
    const updated: Record<string, boolean> = {}
    if (visibleIds.length === 0) {
      site.layers.forEach(l => { updated[l.id] = true })
    } else {
      const visibleSet = new Set(visibleIds)
      site.layers.forEach(l => { updated[l.id] = visibleSet.has(l.id) })
    }
    setLayerStates(prev => ({ ...prev, ...updated }))
  }, [site?.layers])

  const cameraPosition = site?.default_camera ?? DEFAULT_CAMERA

  return (
    <div className="viewer-page">
      {/* Header */}
      <header className="viewer-header">
        <div className="header-left">
          <button className="header-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="header-brand">
            <button
              className="brand-logo-btn"
              title="All Sites"
              onClick={() => navigate('/sites')}
            >
              {site?.logo_url ? (
                <img src={site.logo_url} alt={site.name} className="brand-logo" />
              ) : (
                <svg className="brand-mark" width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L28.66 9.5V24.5L16 32L3.34 24.5V9.5L16 2Z" fill="url(#brand-grad)" />
                  <path d="M16 8L22.66 12V20L16 24L9.34 20V12L16 8Z" fill="rgba(255,255,255,0.15)" />
                  <path d="M16 12L19.46 14V18L16 20L12.54 18V14L16 12Z" fill="rgba(255,255,255,0.25)" />
                  <defs>
                    <linearGradient id="brand-grad" x1="3.34" y1="2" x2="28.66" y2="32">
                      <stop offset="0%" stopColor={site?.primary_color ?? '#818cf8'} />
                      <stop offset="100%" stopColor={site?.primary_color ?? '#6366f1'} />
                    </linearGradient>
                  </defs>
                </svg>
              )}
            </button>
            <div className="brand-text">
              <span className="brand-name">MightyTwin</span>
              {site && (
                <span className="site-name">
                  <span className="site-separator" />
                  {site.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            className="header-icon-btn"
            title="All Sites"
            onClick={() => navigate('/sites')}
          >
            <Globe size={16} />
            <span className="header-btn-label">All Sites</span>
          </button>
          {loading && <Loader size={16} className="spin" />}
          {storyMaps.length > 0 && (
            <button
              className="header-icon-btn"
              title="Stories"
              onClick={() => setStoryPickerOpen(!storyPickerOpen)}
            >
              <BookOpen size={16} />
              <span className="header-btn-label">Stories</span>
            </button>
          )}
          {user && (
            <button className="user-menu" onClick={() => setMenuOpen(!menuOpen)}>
              <div className="user-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="user-name">{user.name}</span>
              <ChevronDown size={14} className="user-chevron" />
            </button>
          )}
        </div>
      </header>

      {/* Slide-out menu */}
      {menuOpen && (
        <SlideMenu
          sites={sites}
          siteSlug={siteSlug}
          site={site}
          layerStates={layerStates}
          user={user}
          onClose={() => setMenuOpen(false)}
          onNavigate={(slug) => { navigate(`/viewer/site/${slug}`); setMenuOpen(false) }}
          onLayerToggle={handleLayerToggle}
          onLogout={handleLogout}
        />
      )}

      {/* Error state */}
      {error && (
        <div className="viewer-error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Story Map Picker */}
      {storyPickerOpen && storyMaps.length > 0 && (
        <StoryPicker
          storyMaps={storyMaps}
          activeStoryMapId={activeStoryMap?.id}
          onSelect={(sm) => {
            setActiveStoryMap(sm)
            setCurrentSlide(0)
            setStoryPickerOpen(false)
          }}
          onClose={() => setStoryPickerOpen(false)}
        />
      )}

      {/* Cesium Viewer */}
      <div className="viewer-content">
        <CesiumViewer
          siteId={siteSlug}
          site={site}
          initialPosition={cameraPosition}
          layers={viewerLayers}
          layersLoading={loading}
          onViewerReady={(v) => { cesiumViewerRef.current = v }}
          onLayerToggle={handleLayerToggle}
          onLayerOpacityChange={handleLayerOpacity}
        />
      </div>

      {/* Story Map Player */}
      {activeStoryMap && (
        <StoryMapPlayer
          storyMap={activeStoryMap}
          currentSlide={currentSlide}
          onSlideChange={setCurrentSlide}
          onClose={() => {
            setActiveStoryMap(null)
            // Restore all layers visible when closing
            const restored: Record<string, boolean> = {}
            site?.layers?.forEach(l => { restored[l.id] = true })
            setLayerStates(prev => ({ ...prev, ...restored }))
          }}
          viewer={cesiumViewerRef.current}
          onVisibleLayersChange={handleVisibleLayersChange}
        />
      )}
    </div>
  )
}
