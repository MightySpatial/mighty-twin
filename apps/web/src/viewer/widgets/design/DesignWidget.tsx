/**
 * MightyTwin — Design Widget
 * Rail navigation on the left, panel content on the right.
 * Orchestrates all design sub-panels.
 */
import { useCallback, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { Check, CloudOff, Loader, RefreshCw } from 'lucide-react'
import { RAIL_TABS } from './types'
import type { ElevationDatum } from './types'
import { useDesignState } from './useDesignState'
import { useSketchPersistence } from './useSketchPersistence'
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
import './DesignWidget.css'

/** Glyph index for the mobile mini-controller header. Keys mirror
 *  DesignTool — anything missing falls through to the pencil. */
const TOOL_ICON: Record<string, string> = {
  point: '📍', line: '📏', polygon: '⬡', rectangle: '▭',
  circle: '○', traverse: '↗', box: '⬛', pit: '⬇', cylinder: '⬤', select: '↖',
}

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

  // Mobile mini-mode — when a tool is active on phones we collapse the
  // entire widget to a 25vh controller pinned to the bottom of the
  // viewport so the user has the map to interact with. Mirrors the way
  // the design widget shrinks on touch devices in the spec.
  const isMiniMode = isPhone && state.activeTool !== null

  if (isMiniMode) {
    const tool = state.activeTool!
    const handleDone = () => {
      if (state.solidDraft) {
        confirmSolidPlacement()
        return
      }
      state.setActiveTool(null)
    }
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          height: '25vh',
          background: 'rgba(18,22,30,0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 16px',
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{TOOL_ICON[tool] ?? '✏️'}</span>
          <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{tool}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => state.setActiveTool(null)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              background: 'var(--accent, #4f8ef7)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              marginLeft: 6,
            }}
          >
            Done
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Datum</label>
          <select
            value={state.elevationConfig.datum}
            onChange={(e) =>
              state.setElevationConfig({
                ...state.elevationConfig,
                datum: e.target.value as ElevationDatum,
              })
            }
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: 'inherit',
              padding: '3px 6px',
              fontSize: 12,
            }}
          >
            <option value="terrain">Terrain</option>
            <option value="ellipsoid">Ellipsoid</option>
            <option value="mga2020">MGA2020</option>
            <option value="custom_terrain">Custom terrain</option>
          </select>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Offset</label>
          <input
            type="number"
            value={state.elevationConfig.offset}
            onChange={(e) =>
              state.setElevationConfig({
                ...state.elevationConfig,
                offset: Number(e.target.value),
              })
            }
            style={{
              width: 80,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: 'inherit',
              padding: '3px 6px',
              fontSize: 12,
            }}
          />
        </div>
      </div>
    )
  }

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
  // Map our 4 statuses to the 4 visual buckets: 'idle' covers the never-saved
  // state; once a save has occurred we bucket idle into 'saved' so the pill
  // stays teal between debounced saves rather than flashing grey.
  const visualStatus =
    status === 'idle' ? (lastSavedAt ? 'saved' : 'idle') : status
  return (
    <span
      className="design-save-pill"
      data-status={visualStatus}
      title={title}
      onClick={status === 'error' ? onRetry : undefined}
    >
      {icon}
      {label}
      {status === 'error' && <RefreshCw size={10} />}
    </span>
  )
}
