/**
 * MightyTwin — Viewer Sidebar
 * Docked left-side panel: Layers tab + extension panels tab.
 * On mobile, falls back to the traditional floating layer panel.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  Mountain,
  Search,
  Ruler,
  List,
  Home,
  Table as TableIcon,
} from 'lucide-react'
import type { Layer } from '../CesiumViewer/types'
import type { ViewerContext, PanelProps } from '../../extensions/types'
import type { Viewer as CesiumViewerType } from 'cesium'
import { AttributeTable } from '@mightydt/ui'
import LayerItem from '../../widgets/layers/LayerItem'
import { SitePickerContent, pushRecentSite, type SiteEntry } from '../SitePicker'
import HomePanel from './HomePanel'
import './ViewerSidebar.css'

interface SidebarTab {
  id: string
  label: string
  icon: React.ReactNode
  content: React.ReactNode
}

interface ViewerSidebarProps {
  // Site chip — shown at top of ribbon so it never overlaps the canvas topBar
  site?: { slug: string; name: string } | null
  /** All sites visible to the user — feeds the in-sidebar SitePicker.
   *  When omitted (e.g. public viewer pages), the Site tab falls back
   *  to a single read-only chip and won't open a picker. */
  pickerSites?: SiteEntry[]
  pickerLoading?: boolean
  /** Optional override — used by mobile to fall back to the legacy
   *  popover/sheet behaviour from CesiumViewer. */
  onOpenSitePicker?: () => void
  /** Welcome content shown in the new Home tab. Pulled from
   *  site.config.home — schema is { hero_image_url?, hero_video_url?,
   *  intro_html?, links?: [{label, url}] }. */
  homeContent?: {
    hero_image_url?: string | null
    hero_video_url?: string | null
    intro_html?: string | null
    links?: { label: string; url: string }[]
  } | null
  // Layers
  layers: Layer[]
  layersLoading?: boolean
  onLayerToggle?: (layerId: string) => void
  onLayerOpacityChange?: (layerId: string, opacity: number) => void
  // Extension panels
  extensionPanels: Array<{
    id: string
    label: string
    icon: React.ReactNode
    component: React.ComponentType<PanelProps>
  }>
  activeExtPanel: string | null
  setActiveExtPanel: (id: string | null) => void
  viewer: CesiumViewerType | null
  siteId: string
  siteConfigState: Record<string, unknown>
  setSiteConfigState: (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  // Sidebar state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  isMobile: boolean
  // Terrain panel — when provided, adds a Terrain tab to the ribbon
  terrainPanel?: React.ReactNode
  terrainTabActive?: boolean
  onTerrainTabClick?: () => void
  // Primary widget action tabs — Search, Measure, Legend fire actions,
  // highlighted when the matching tool is active.
  activeWidgetId?: string | null
  onWidgetTabClick?: (id: string) => void
}

function LayerSkeleton() {
  return (
    <div className="layer-skeleton">
      {[1, 2, 3].map(i => (
        <div key={i} className="layer-skeleton-item">
          <div className="layer-skeleton-icon" />
          <div className="layer-skeleton-text" />
          <div className="layer-skeleton-badge" />
        </div>
      ))}
    </div>
  )
}

export default function ViewerSidebar({
  site,
  pickerSites = [],
  pickerLoading = false,
  onOpenSitePicker,
  homeContent,
  layers,
  layersLoading = false,
  onLayerToggle,
  onLayerOpacityChange,
  extensionPanels,
  activeExtPanel,
  setActiveExtPanel,
  viewer,
  siteId,
  siteConfigState,
  setSiteConfigState,
  sidebarOpen,
  setSidebarOpen,
  isMobile,
  terrainPanel,
  terrainTabActive = false,
  onTerrainTabClick,
  activeWidgetId,
  onWidgetTabClick,
}: ViewerSidebarProps) {
  const navigate = useNavigate()
  const [attrLayerId, setAttrLayerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('home')

  // Sync activeTab when ext panel changes
  if (activeExtPanel && activeTab !== activeExtPanel) {
    setActiveTab(activeExtPanel)
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    if (tabId === 'layers' || tabId === 'site' || tabId === 'home') {
      setActiveExtPanel(null)
    } else {
      setActiveExtPanel(tabId)
    }
    if (!sidebarOpen) setSidebarOpen(true)
  }

  const tabs: SidebarTab[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home size={16} />,
      content: <HomePanel siteName={site?.name ?? null} content={homeContent ?? null} />,
    },
    ...(site && pickerSites.length > 0
      ? [
          {
            id: 'site',
            label: 'Site',
            icon: (
              <span className="sidebar-site-chip-icon">
                {site.name.slice(0, 1).toUpperCase()}
              </span>
            ),
            content: (
              <div className="sidebar-site-panel">
                <SitePickerContent
                  sites={pickerSites}
                  currentSlug={site.slug}
                  loading={pickerLoading}
                  autoFocusInput={!isMobile}
                  onSelect={(slug) => {
                    pushRecentSite(slug)
                    navigate(`/viewer/site/${encodeURIComponent(slug)}`)
                  }}
                />
              </div>
            ),
          } as SidebarTab,
        ]
      : []),
    {
      id: 'layers',
      label: 'Layers',
      icon: <Layers size={16} />,
      content: (
        <div className="sidebar-layer-list">
          {layersLoading && layers.length === 0 ? (
            <LayerSkeleton />
          ) : layers.length === 0 ? (
            <div className="layer-empty">No layers configured</div>
          ) : (
            [...layers]
              .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
              .map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  onToggle={onLayerToggle}
                  onOpacityChange={onLayerOpacityChange}
                  onShowAttributes={setAttrLayerId}
                />
              ))
          )}
        </div>
      ),
    },
    ...extensionPanels.map(ep => ({
      id: ep.id,
      label: ep.label,
      icon: ep.icon,
      content: viewer ? (() => {
        const ctx: ViewerContext = {
          siteId,
          getSiteConfig: (key) => siteConfigState[key],
          setSiteConfig: (key, val) => setSiteConfigState(prev => ({ ...prev, [key]: val })),
        }
        const PanelComponent = ep.component
        return (
          <div className="sidebar-ext-panel">
            <PanelComponent
              viewer={viewer}
              context={ctx}
              onClose={() => {
                setActiveExtPanel(null)
                setActiveTab('layers')
              }}
            />
          </div>
        )
      })() : null,
    })),
  ]

  const currentTab = tabs.find(t => t.id === activeTab) ?? tabs[0]

  return (
    <>
      {/* Sidebar */}
      <div className={`viewer-sidebar${sidebarOpen ? ' viewer-sidebar--open' : ''}`}>
        {/* Tab Bar */}
        <div className="sidebar-tabs">
          {/* Legacy fallback — when the sidebar can't host the in-tab
              picker (no pickerSites passed, e.g. mobile or public viewer)
              we still need a way to open the picker. Show the original
              chip and route the click to the host's onOpenSitePicker
              callback (which opens the popover/sheet). */}
          {site && pickerSites.length === 0 && onOpenSitePicker && (
            <button
              className="sidebar-site-chip-legacy"
              onClick={onOpenSitePicker}
              title={`Switch site — ${site.name}`}
            >
              <span className="sidebar-site-chip-icon">
                {site.name.slice(0, 1).toUpperCase()}
              </span>
            </button>
          )}
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-tab${activeTab === tab.id ? ' sidebar-tab--active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
            >
              <span className="sidebar-tab-icon">{tab.icon}</span>
              <span className="sidebar-tab-label">
                {sidebarOpen ? tab.label : tab.label.slice(0, 6)}
              </span>
            </button>
          ))}
          {/* Primary widget action tabs — Search, Measure, Legend,
              Table. Table moved here from the (now-retired) secondary
              bottom rail; the click still opens the existing
              AttributeTableWidget drawer / modal — only the entry
              point relocated. */}
          {onWidgetTabClick && (
            <>
              <div className="sidebar-tab-divider" />
              {[
                { id: 'search',  label: 'Search',  Icon: Search    },
                { id: 'measure', label: 'Measure', Icon: Ruler     },
                { id: 'legend',  label: 'Legend',  Icon: List      },
                { id: 'table',   label: 'Table',   Icon: TableIcon },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`sidebar-tab${activeWidgetId === id ? ' sidebar-tab--active' : ''}`}
                  onClick={() => {
                    onWidgetTabClick(id)
                    // Open the sidebar for Search/Measure/Legend
                    // (their UI lives in the sidebar panel). Table is
                    // a modal, so leave the sidebar collapsed.
                    if (!sidebarOpen && id !== 'table') setSidebarOpen(true)
                  }}
                  title={label}
                >
                  <span className="sidebar-tab-icon"><Icon size={16} /></span>
                  <span className="sidebar-tab-label">
                    {sidebarOpen ? label : label.slice(0, 6)}
                  </span>
                </button>
              ))}
            </>
          )}
          {/* Terrain tab — only when terrain panel is provided */}
          {terrainPanel && (
            <button
              className={`sidebar-tab${terrainTabActive ? ' sidebar-tab--active' : ''}`}
              onClick={() => {
                onTerrainTabClick?.()
                if (!terrainTabActive) setSidebarOpen(true)
              }}
              title="Terrain"
            >
              <span className="sidebar-tab-icon"><Mountain size={16} /></span>
              <span className="sidebar-tab-label">
                {sidebarOpen ? 'Terrain' : 'Terr'}
              </span>
            </button>
          )}
          {/* Collapse toggle */}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {/* Panel Content */}
        {sidebarOpen && (
          <div className="sidebar-content">
            {terrainTabActive && terrainPanel ? (
              // Terrain panel takes the full content area — no header chrome,
              // the widget has its own tab bar inside.
              <div className="sidebar-content-body" style={{ overflow: 'hidden' }}>
                {terrainPanel}
              </div>
            ) : (
              <>
                <div className="sidebar-content-header">
                  <span className="sidebar-content-title">{currentTab.label}</span>
                  {currentTab.id === 'layers' && layers.length > 0 && (
                    <span className="layer-count-badge">{layers.length}</span>
                  )}
                </div>
                <div className="sidebar-content-body">
                  {currentTab.content}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Attribute Table Modal */}
      {attrLayerId && (
        <AttributeTable
          layerId={attrLayerId}
          layerName={layers.find(l => l.id === attrLayerId)?.name ?? ''}
          fetchAttributes={async (id) => {
            const r = await fetch(`/api/data-sources/${id}/attributes`, { credentials: 'include' })
            const data = await r.json()
            return data.features ?? []
          }}
          onClose={() => setAttrLayerId(null)}
          viewerUrl={`/viewer?layer=${attrLayerId}&mode=view`}
        />
      )}
    </>
  )
}
