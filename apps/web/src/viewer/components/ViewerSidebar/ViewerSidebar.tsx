/**
 * MightyTwin — Viewer Sidebar
 * Docked left-side panel: Layers tab + extension panels tab.
 * On mobile, falls back to the traditional floating layer panel.
 */
import { useState } from 'react'
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react'
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
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-tab${activeTab === tab.id ? ' sidebar-tab--active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
            >
              <span className="sidebar-tab-icon">{tab.icon}</span>
              {sidebarOpen && <span className="sidebar-tab-label">{tab.label}</span>}
            </button>
          ))}
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
            <div className="sidebar-content-header">
              <span className="sidebar-content-title">{currentTab.label}</span>
              {currentTab.id === 'layers' && layers.length > 0 && (
                <span className="layer-count-badge">{layers.length}</span>
              )}
            </div>
            <div className="sidebar-content-body">
              {currentTab.content}
            </div>
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
