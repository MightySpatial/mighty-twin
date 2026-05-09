/**
 * MightyTwin — Design Widget
 *
 * Slim orchestrator. Composes the design state hooks, the rail navigation,
 * and the active panel. All visual subcomponents (rail nav, save indicator,
 * mobile mini-mode, individual panels) live in their own files.
 */
import { useCallback, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { RAIL_TABS } from './types'
import { useDesignState, useSketchPersistence } from './hooks'
import { useSolidTools } from './tools/useSolidTools'
import { useMoveTool } from './tools/useMoveTool'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import SketchLayersPanel from './panels/SketchLayersPanel'
import DrawPanel from './panels/DrawPanel'
import EditPanel from './panels/EditPanel'
import HistoryPanel from './panels/HistoryPanel'
import StylePanel from './panels/StylePanel'
import SubmitPanel from './panels/SubmitPanel'
import DownloadPanel from './panels/DownloadPanel'
import SaveIndicator from './primitives/SaveIndicator'
import MobileToolMini from './primitives/MobileToolMini'
import './styles/index.css'

interface DesignWidgetProps {
  viewer: CesiumViewerType
  onClose: () => void
  /** Site slug — needed for the Submit tab (one-shot moderation send). */
  siteSlug?: string | null
}

export default function DesignWidget({ viewer, onClose, siteSlug = null }: DesignWidgetProps) {
  const state = useDesignState(viewer)
  const { activeTab, setActiveTab } = state
  const { isPhone } = useBreakpoint()

  // ── Persistence: hydrate sketch state on mount, debounce-save on change ──
  const handleHydrate = useCallback(
    (loadedLayers: typeof state.layers, loadedFeatures: typeof state.features) => {
      state.setLayers(loadedLayers)
      state.setFeatures(loadedFeatures)
      if (loadedLayers.length > 0 && !state.activeLayerId) {
        state.setActiveLayerId(loadedLayers[0].id)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const persistence = useSketchPersistence({
    siteSlug,
    layers: state.layers,
    features: state.features,
    onHydrate: handleHydrate,
  })

  // ── Tool ↔ tab linking: 'select' tool follows the Edit tab ──────────────
  useEffect(() => {
    if (activeTab === 'edit') state.setActiveTool('select')
    else if (state.activeTool === 'select') state.setActiveTool(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Move + solid tools registered against the viewer ────────────────────
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

  // ── Mobile mini-mode: tool active on phone → collapse to bottom strip ───
  const isMiniMode = isPhone && state.activeTool !== null
  if (isMiniMode) {
    const handleDone = () => {
      if (state.solidDraft) confirmSolidPlacement()
      else state.setActiveTool(null)
    }
    return (
      <MobileToolMini
        tool={state.activeTool!}
        elevationConfig={state.elevationConfig}
        onElevationChange={state.setElevationConfig}
        onCancel={() => state.setActiveTool(null)}
        onDone={handleDone}
      />
    )
  }

  return (
    <div className="design-widget">
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

      <div className="design-panel-content">
        <div className="design-panel-header">
          <span className="design-panel-title">
            {RAIL_TABS.find(t => t.id === activeTab)?.label ?? 'Design'}
          </span>
          {siteSlug && (
            <SaveIndicator
              status={persistence.status}
              lastSavedAt={persistence.lastSavedAt}
              lastError={persistence.lastError}
              onRetry={persistence.saveNow}
            />
          )}
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
              layers={state.layers}
              viewer={viewer}
              onMoveFeature={state.moveFeature}
              onDelete={state.removeFeature}
              onRename={state.renameFeature}
              onUpdateParams={state.updateFeatureParams}
              onUpdateAttribute={state.updateFeatureAttribute}
              onUpdateStyle={state.updateFeatureStyle}
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
              groups={state.featuresByLayer}
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
            <DownloadPanel
              viewer={viewer}
              layers={state.layers}
              features={state.features}
            />
          )}
        </div>
      </div>
    </div>
  )
}
