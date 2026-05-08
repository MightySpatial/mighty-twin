/**
 * MightyTwin — Viewer Sidebar
 * Docked left-side panel: Layers tab + extension panels tab.
 * On mobile, falls back to the traditional floating layer panel.
 */
import { useState } from 'react'
import { Layers, ChevronLeft, ChevronRight, Mountain, Search, Ruler, List } from 'lucide-react'
import type { Layer } from '../CesiumViewer/types'
import type { ViewerContext, PanelProps } from '../../extensions/types'
import type { Viewer as CesiumViewerType } from 'cesium'
import { AttributeTable } from '@mightydt/ui'
import LayerItem from '../../widgets/layers/LayerItem'
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
  onOpenSitePicker?: () => void
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
  onOpenSitePicker,
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
  const [attrLayerId, setAttrLayerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('layers')

  // Sync activeTab when ext panel changes
  if (activeExtPanel && activeTab !== activeExtPanel) {
    setActiveTab(activeExtPanel)
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    if (tabId === 'layers') {
      setActiveExtPanel(null)
    } else {
      setActiveExtPanel(tabId)
    }
    if (!sidebarOpen) setSidebarOpen(true)
  }

  const tabs: SidebarTab[] = [
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
          {/* Site chip — top of ribbon, opens site picker */}
          {site && (
            <button
              className="sidebar-site-chip"
              onClick={onOpenSitePicker}
              title={`Switch site — ${site.name}`}
            >
              <span className="sidebar-site-chip-icon">
                {site.name.slice(0, 1).toUpperCase()}
              </span>
              {sidebarOpen && (
                <span className="sidebar-site-chip-name">{site.name}</span>
              )}
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
          {/* Primary widget action tabs — Search, Measure, Legend */}
          {onWidgetTabClick && (
            <>
              <div className="sidebar-tab-divider" />
              {[
                { id: 'search',  label: 'Search',  Icon: Search },
                { id: 'measure', label: 'Measure', Icon: Ruler  },
                { id: 'legend',  label: 'Legend',  Icon: List   },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`sidebar-tab${activeWidgetId === id ? ' sidebar-tab--active' : ''}`}
                  onClick={() => {
                    onWidgetTabClick(id)
                    if (!sidebarOpen) setSidebarOpen(true)
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
