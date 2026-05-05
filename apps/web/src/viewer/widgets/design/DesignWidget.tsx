/**
 * MightyTwin — Design Widget
 * Rail navigation on the left, panel content on the right.
 * Orchestrates all design sub-panels.
 */
import { useCallback, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { Check, CloudOff, Loader, RefreshCw } from 'lucide-react'
import { RAIL_TABS } from './types'
import type { DesignRailTab } from './types'
import { useDesignState } from './useDesignState'
import { useSketchPersistence } from './useSketchPersistence'
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

  // Persistence: hydrate the design state from /api/me/sketch-layers
  // on mount, then debounce-save back on every change. The hook
  // handles the round-trip so the widget keeps its existing local
  // state surface and we just pass an onHydrate callback.
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

function SaveIndicator({
  status,
  lastSavedAt,
  lastError,
  onRetry,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: number | null
  lastError: string | null
  onRetry: () => void
}) {
  const tint =
    status === 'error' ? '#fb7185' : status === 'saving' ? '#9bb3ff' : '#34d399'
  const icon =
    status === 'saving' ? (
      <Loader size={11} className="spin" />
    ) : status === 'error' ? (
      <CloudOff size={11} />
    ) : (
      <Check size={11} />
    )
  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'error'
      ? 'Save failed'
      : lastSavedAt
      ? 'Saved'
      : 'Up to date'
  const title = lastError
    ? lastError
    : lastSavedAt
    ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}`
    : 'No unsaved changes'
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
        padding: '2px 8px',
        borderRadius: 999,
        background: `${tint}1a`,
        color: tint,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        cursor: status === 'error' ? 'pointer' : 'default',
      }}
      onClick={status === 'error' ? onRetry : undefined}
    >
      {icon}
      {label}
      {status === 'error' && <RefreshCw size={10} />}
    </span>
  )
}
