/**
 * MightyTwin — Design Widget (DAG-engine driven shell).
 *
 * Layout (top to bottom):
 *   [ design-rail ]               horizontal tab strip with teal glow
 *   [ design-panel-header ]       Design title + active sketch + save badge + close
 *   [ sketch-context-strip ]      active layer + default star + snap toggle
 *   [ place-mode-bar ]            overlay when activeToolId !== null
 *   [ design-panel-body ]         active tab content
 *   [ design-status-bar ]         current tool + cursor coords
 *
 * State backbone is `useCadEngine` (Zustand). Persistence + Cesium
 * lifecycle are wired by useDagPersistence / useDagCesium.
 *
 * Mobile (< 1024px): the widget overlays the viewport. Picking a draw
 * tool auto-slides the widget down to a 60px handle so the user sees
 * the globe; finishing/cancelling auto-restores. The handle's chevron
 * lets the user manually pull the widget back up mid-draw.
 */
import { useEffect, useState } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useCadEngine } from './sketch/useCadEngine'
import { useDagPersistence } from './sketch/useDagPersistence'
import { useDagCesium } from './sketch/useDagCesium'
import { useCursorCoords } from './hooks/useCursorCoords'
import LayersTab from './panels/tabs/LayersTab'
import SketchTab from './panels/tabs/SketchTab'
import FeaturesTab from './panels/tabs/FeaturesTab'
import PropertiesTab from './panels/tabs/PropertiesTab'
import HistoryTab from './panels/tabs/HistoryTab'
import DownloadTab from './panels/tabs/DownloadTab'
import PlaceModeBar from './panels/PlaceModeBar'
import SaveIndicator from './primitives/SaveIndicator'
import StatusBar from './primitives/StatusBar'
import MobileMinimiseHandle from './primitives/MobileMinimiseHandle'
import { lookupTool } from './sketch/tools/registry'
import './styles/index.css'

interface DesignWidgetProps {
  viewer: CesiumViewerType
  onClose: () => void
  /** Site slug — needed for the templates registry + submissions. */
  siteSlug?: string | null
}

export type DesignTabId = 'layers' | 'sketch' | 'features' | 'properties' | 'history' | 'download'

const TABS: { id: DesignTabId; label: string; icon: string }[] = [
  { id: 'layers',     label: 'Layers',     icon: '▤' },
  { id: 'sketch',     label: 'Sketch',     icon: '✎' },
  { id: 'features',   label: 'Features',   icon: '☷' },
  { id: 'properties', label: 'Properties', icon: '⌖' },
  { id: 'history',    label: 'History',    icon: '☰' },
  { id: 'download',   label: 'Export',     icon: '↓' },
]

/** Tools that should auto-minimise on mobile when active. */
const MOBILE_DRAW_TOOLS = new Set([
  'point', 'line', 'polygon', 'rectangle', 'curve', 'ellipse', 'polygon_n',
  'pipe_draw', 'traverse', 'pt_line', 'pt_circle', 'pt_cylinder',
  'pt_sphere', 'pt_cone', 'pt_box', 'pt_pit', 'building',
])

export default function DesignWidget({ viewer, onClose, siteSlug = null }: DesignWidgetProps) {
  const [activeTab, setActiveTab] = useState<DesignTabId>('layers')
  const [mobileMinimised, setMobileMinimised] = useState(false)
  const { isMobile } = useBreakpoint()
  const cursor = useCursorCoords(viewer)

  const persistence = useDagPersistence({ siteSlug })
  useDagCesium({ viewer })

  const activeToolId = useCadEngine(s => s.activeToolId)
  const setActiveTool = useCadEngine(s => s.setActiveTool)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const sketches = useCadEngine(s => s.sketches)
  const activeSketch = activeSketchId ? sketches[activeSketchId] : null
  const tool = lookupTool(activeToolId)

  // Mobile auto-minimise on draw.
  useEffect(() => {
    if (!isMobile) {
      if (mobileMinimised) setMobileMinimised(false)
      return
    }
    setMobileMinimised(activeToolId != null && MOBILE_DRAW_TOOLS.has(activeToolId))
  }, [isMobile, activeToolId, mobileMinimised])

  // Keyboard: ESC cancels active tool.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape' && activeToolId) {
        e.stopPropagation()
        setActiveTool(null)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [activeToolId, setActiveTool])

  // Selecting in Properties tab → auto-cancel any active tool.
  useEffect(() => {
    if (activeTab === 'properties' && activeToolId) setActiveTool(null)
  }, [activeTab, activeToolId, setActiveTool])

  const widgetClass = [
    'design-widget',
    isMobile ? 'design-widget--mobile' : '',
    isMobile && mobileMinimised ? 'is-minimised' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className={widgetClass}>
        <nav className="design-rail" role="tablist" aria-label="Design tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`design-rail-btn${activeTab === tab.id ? ' active' : ''}`}
              title={tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="design-rail-icon">{tab.icon}</span>
              <span className="design-rail-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="design-panel-content">
          <div className="design-panel-header">
            <h4 className="design-panel-title">Design</h4>
            <span className="design-panel-ctx">{activeSketch?.name ?? 'No sketch'}</span>
            {siteSlug && (
              <SaveIndicator
                status={
                  persistence.status === 'loading' ? 'saving'
                  : persistence.status === 'saving' ? 'saving'
                  : persistence.status === 'error' ? 'error'
                  : persistence.lastSavedAt ? 'saved' : 'idle'
                }
                lastSavedAt={persistence.lastSavedAt}
                lastError={persistence.lastError}
                onRetry={persistence.flushNow}
              />
            )}
            <button className="ext-panel-close" onClick={onClose} title="Close">×</button>
          </div>

          {activeToolId && tool && <PlaceModeBar siteSlug={siteSlug} />}

          <div className="design-panel-body">
            {activeTab === 'layers' && <LayersTab siteSlug={siteSlug} />}
            {activeTab === 'sketch' && <SketchTab viewer={viewer} siteSlug={siteSlug} />}
            {activeTab === 'features' && <FeaturesTab />}
            {activeTab === 'properties' && <PropertiesTab />}
            {activeTab === 'history' && <HistoryTab />}
            {activeTab === 'download' && <DownloadTab viewer={viewer} siteSlug={siteSlug} />}
          </div>

          <StatusBar
            tool={activeToolId}
            hint={tool?.label}
            cursor={cursor}
          />
        </div>
      </div>

      {isMobile && (
        <MobileMinimiseHandle
          visible={mobileMinimised}
          tool={tool?.label ?? null}
          onExpand={() => setMobileMinimised(false)}
          onCancel={() => setActiveTool(null)}
        />
      )}
    </>
  )
}
