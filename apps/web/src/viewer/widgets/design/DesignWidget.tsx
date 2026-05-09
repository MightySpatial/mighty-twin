/**
 * MightyTwin — Design Widget
 *
 * Layout (top to bottom):
 *   [ design-rail ]               horizontal tab strip (teal glow underline)
 *   [ design-panel-header ]       title + ctx + save badge + close
 *   [ sketch-context-strip ]      active layer + default star + snap toggle
 *   [ design-panel-body ]         scrollable panel content
 *   [ design-status-bar ]         current tool + cursor coords
 *
 * Mobile (< 1024px) overlays the whole viewport (full-screen). When the
 * user picks a draw tool, the widget auto-slides down to a 60px handle
 * so the globe is fully visible for the pick. Finishing or cancelling
 * the tool auto-restores. The handle's chevron lets the user manually
 * pull the widget back up mid-draw.
 */
import { useCallback, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import { RAIL_TABS } from './types'
import { useDesignState, useSketchPersistence } from './hooks'
import { useCursorCoords } from './hooks/useCursorCoords'
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
import SketchContextStrip from './primitives/SketchContextStrip'
import StatusBar from './primitives/StatusBar'
import MobileMinimiseHandle from './primitives/MobileMinimiseHandle'
import './styles/index.css'

interface DesignWidgetProps {
  viewer: CesiumViewerType
  onClose: () => void
  /** Site slug — needed for the Submit tab + the attribute template registry. */
  siteSlug?: string | null
}

const TOOL_HINTS: Record<string, string> = {
  point:     'Click to place a point',
  line:      'Click vertices, double-click to finish',
  polygon:   'Click vertices, double-click to close',
  rectangle: 'Click first corner, then opposite corner',
  circle:    'Click centre, then radius',
  traverse:  'Click start; add bearing/distance legs',
  box:       'Click to place a box',
  pit:       'Click to place an open-top pit',
  cylinder:  'Click to place a cylinder',
  select:    'Click a feature to select',
}

/** Tools that should auto-minimise on mobile. The 'select' pseudo-tool
 *  doesn't need full screen, so we leave the widget open for it. */
const DRAW_TOOLS_ON_MOBILE = new Set([
  'point', 'line', 'polygon', 'rectangle', 'circle', 'traverse',
  'box', 'pit', 'cylinder',
])

export default function DesignWidget({ viewer, onClose, siteSlug = null }: DesignWidgetProps) {
  const state = useDesignState(viewer)
  const cursor = useCursorCoords(viewer)
  const { activeTab, setActiveTab } = state
  const { isMobile } = useBreakpoint()

  // ── Persistence ─────────────────────────────────────────────────────────
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

  // ── Tool ↔ tab linking ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'edit') state.setActiveTool('select')
    else if (state.activeTool === 'select') state.setActiveTool(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Mobile auto-minimise / restore ──────────────────────────────────────
  // When a draw tool activates on mobile, slide the widget down so the
  // user has the globe to interact with. When the tool clears (commit
  // / cancel / ESC), auto-restore. Manual chevron toggles override
  // mid-draw — they live in mobileMinimised state independently.
  useEffect(() => {
    if (!isMobile) {
      // Always reset on desktop so re-narrowing the window doesn't trap
      // the widget in a hidden state.
      if (state.mobileMinimised) state.setMobileMinimised(false)
      return
    }
    const isDrawing = state.activeTool != null && DRAW_TOOLS_ON_MOBILE.has(state.activeTool)
    state.setMobileMinimised(isDrawing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, state.activeTool])

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

  const cancelActiveTool = useCallback(() => {
    if (state.solidDraft) cancelSolidDraft()
    state.setActiveTool(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.solidDraft])

  const activeTabSpec = RAIL_TABS.find(t => t.id === activeTab)
  const ctxStripVisible = (activeTab === 'sketch' || activeTab === 'edit')
    && state.layers.some(l => l.visible)

  const widgetClass = [
    'design-widget',
    isMobile ? 'design-widget--mobile' : '',
    isMobile && state.mobileMinimised ? 'is-minimised' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className={widgetClass}>
        <nav className="design-rail" role="tablist" aria-label="Design modes">
          {RAIL_TABS.map(tab => (
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
            <span className="design-panel-ctx">{activeTabSpec?.label}</span>
            {siteSlug && (
              <SaveIndicator
                status={persistence.status}
                lastSavedAt={persistence.lastSavedAt}
                lastError={persistence.lastError}
                onRetry={persistence.saveNow}
              />
            )}
            {isMobile && state.activeTool && (
              <button
                type="button"
                className="ext-panel-close"
                onClick={() => state.setMobileMinimised(true)}
                title="Minimise"
                aria-label="Minimise widget"
              >▾</button>
            )}
            <button className="ext-panel-close" onClick={onClose} title="Close">×</button>
          </div>

          {ctxStripVisible && (
            <SketchContextStrip
              layers={state.layers}
              activeLayerId={state.activeLayerId}
              onSetActiveLayer={state.setActiveLayerId}
              defaultLayerId={state.defaultDrawLayerId}
              onSetDefaultLayer={state.setDefaultDrawLayerId}
              snapEnabled={state.snapEnabled}
              onSnapToggle={state.setSnapEnabled}
            />
          )}

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
                onSnapToTerrain={state.snapFeatureToTerrain}
                siteSlug={siteSlug}
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

          <StatusBar
            tool={state.activeTool}
            hint={state.activeTool ? TOOL_HINTS[state.activeTool] ?? null : null}
            cursor={cursor}
          />
        </div>
      </div>

      {isMobile && (
        <MobileMinimiseHandle
          visible={state.mobileMinimised}
          tool={state.activeTool}
          hint={state.activeTool ? TOOL_HINTS[state.activeTool] ?? null : null}
          onExpand={() => state.setMobileMinimised(false)}
          onCancel={cancelActiveTool}
        />
      )}
    </>
  )
}
