/**
 * MightyTwin — Design Widget
 * Rail navigation on the left, panel content on the right.
 * Orchestrates all design sub-panels.
 */
import { useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { RAIL_TABS } from './types'
import type { DesignRailTab } from './types'
import { useDesignState } from './useDesignState'
import { useSolidTools } from './tools/useSolidTools'
import { useMoveTool } from './tools/useMoveTool'
import SketchLayersPanel from './panels/SketchLayersPanel'
import DrawPanel from './panels/DrawPanel'
import EditPanel from './panels/EditPanel'
import HistoryPanel from './panels/HistoryPanel'
import StylePanel from './panels/StylePanel'
import SubmitPanel from './panels/SubmitPanel'
import './DesignWidget.css'

interface DesignWidgetProps {
  viewer: CesiumViewerType
  onClose: () => void
  /** Site slug — needed for the Submit tab (one-shot moderation send). */
  siteSlug?: string | null
}

export default function DesignWidget({ viewer, onClose, siteSlug = null }: DesignWidgetProps) {
  const state = useDesignState(viewer)
  const { activeTab, setActiveTab } = state

  // Auto-activate 'select' tool when Edit tab is active
  useEffect(() => {
    if (activeTab === 'edit') {
      state.setActiveTool('select')
    } else if (state.activeTool === 'select') {
      state.setActiveTool(null)
    }
  }, [activeTab])

  useMoveTool({
    viewer,
    activeTool: state.activeTool,
    features: state.features,
    layers: state.layers,
    selectedFeatureId: state.selectedFeatureId,
    onSelectFeature: state.selectFeature,
  })

  const { confirmSolidPlacement, cancelSolidDraft } = useSolidTools({
    viewer,
    activeTool: state.activeTool,
    elevationConfig: state.elevationConfig,
    activeLayerId: state.activeLayerId,
    layerColour: state.activeLayer?.colour ?? '#94a3b8',
    solidDraft: state.solidDraft,
    onSolidDraftChange: state.setSolidDraft,
    onFeatureAdded: state.addFeature,
  })

  const groups = state.featuresByLayer

  return (
    <div className="design-widget">
      {/* Rail navigation */}
      <nav className="design-rail">
        {RAIL_TABS.map(tab => (
          <button
            key={tab.id}
            className={`design-rail-btn${activeTab === tab.id ? ' active' : ''}`}
            title={tab.label}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="design-rail-icon">{tab.icon}</span>
            <span className="design-rail-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Panel content */}
      <div className="design-panel-content">
        <div className="design-panel-header">
          <span className="design-panel-title">
            {RAIL_TABS.find(t => t.id === activeTab)?.label ?? 'Design'}
          </span>
          <button className="ext-panel-close" onClick={onClose}>×</button>
        </div>

        <div className="design-panel-body">
          {activeTab === 'layers' && (
            <SketchLayersPanel
              layers={state.layers}
              activeLayerId={state.activeLayerId}
              onSetActiveLayer={state.setActiveLayerId}
              onAddLayer={state.addLayer}
              onRemoveLayer={state.removeLayer}
              onRenameLayer={state.renameLayer}
              onSetLayerColour={state.setLayerColour}
              onToggleVisibility={state.toggleLayerVisibility}
              onToggleLock={state.toggleLayerLock}
              presets={state.allPresets}
              onLoadPreset={state.loadPreset}
            />
          )}

          {activeTab === 'sketch' && (
            <DrawPanel
              viewer={viewer}
              activeTool={state.activeTool}
              elevationConfig={state.elevationConfig}
              activeLayer={state.activeLayer}
              onSetTool={state.setActiveTool}
              onSetElevation={state.setElevationConfig}
              onCancelTool={state.cancelTool}
              onFeatureAdded={state.addFeature}
              solidDraft={state.solidDraft}
              onSolidDraftChange={state.setSolidDraft}
              onConfirmSolid={confirmSolidPlacement}
              onCancelSolid={cancelSolidDraft}
              traverseDraft={state.traverseDraft}
              onTraverseDraftChange={state.setTraverseDraft}
            />
          )}

          {activeTab === 'edit' && (
            <EditPanel
              feature={state.selectedFeature}
              viewer={viewer}
              onMoveFeature={state.moveFeature}
              onDelete={state.removeFeature}
              onRename={state.renameFeature}
            />
          )}

          {activeTab === 'style' && (
            <StylePanel
              feature={state.selectedFeature}
              onStyleChange={state.updateFeatureStyle}
            />
          )}

          {activeTab === 'history' && (
            <HistoryPanel
              groups={groups}
              selectedFeatureId={state.selectedFeatureId}
              onSelect={state.selectFeature}
              onDelete={state.removeFeature}
              onToggleCollapse={state.toggleLayerCollapse}
            />
          )}

          {activeTab === 'submit' && (
            <SubmitPanel
              viewer={viewer}
              layers={state.layers}
              features={state.features}
              siteSlug={siteSlug}
            />
          )}

          {activeTab === 'download' && (
            <DesignPlaceholder
              tab="download"
              description="Export sketch data as GeoJSON or IFC."
            />
          )}
        </div>
      </div>
    </div>
  )
}

function DesignPlaceholder({ tab, description }: { tab: DesignRailTab; description: string }) {
  return (
    <div className="design-placeholder">
      <p className="design-placeholder-title">
        {RAIL_TABS.find(t => t.id === tab)?.label}
      </p>
      <p className="design-placeholder-desc">{description}</p>
      <p className="design-placeholder-hint">Available in Sprint 2.</p>
    </div>
  )
}
