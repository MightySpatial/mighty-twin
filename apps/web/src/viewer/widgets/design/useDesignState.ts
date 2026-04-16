/**
 * MightyTwin — Design Widget State
 * Manages sketch layers, placed features, active tool, selection,
 * elevation mode, and per-feature styles.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { SetStateAction } from 'react'
import {
  Viewer as CesiumViewerType,
  Entity,
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
} from 'cesium'
import type {
  SketchFeature,
  DesignTool,
  ElevationConfig,
  DesignRailTab,
  BoxDraft,
  PitDraft,
  CylDraft,
  TraverseDraft,
  SketchLayer,
} from './types'
import { DEFAULT_ELEVATION_CONFIG } from './types'
import { BUILTIN_PRESETS } from './presets/builtinPresets'
import type { LayerPreset } from './presets/builtinPresets'
import { useLayerOps, makeSketchLayer } from './useLayerOps'
import { useFeatureOps } from './useFeatureOps'

/** Keyboard shortcut → tool mapping (hoisted to avoid re-creation in useEffect). */
const TOOL_KEYS: Record<string, DesignTool> = {
  p: 'point',
  l: 'line',
  g: 'polygon',
  r: 'rectangle',
  c: 'circle',
}

export function useDesignState(viewer: CesiumViewerType | null) {
  // ── Rail navigation ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DesignRailTab>('layers')

  // ── Tool state ─────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DesignTool>(null)
  const [elevationConfig, setElevationConfig] = useState<ElevationConfig>(DEFAULT_ELEVATION_CONFIG)

  // ── Solid draft ─────────────────────────────────────────────────────────────
  const [solidDraft, setSolidDraft] = useState<BoxDraft | PitDraft | CylDraft | null>(null)

  // ── Traverse draft ─────────────────────────────────────────────────────────
  const [traverseDraft, setTraverseDraft] = useState<TraverseDraft | null>(null)

  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)

  // Refs to avoid re-registering event listeners on every state change
  const activeToolRef = useRef(activeTool)
  activeToolRef.current = activeTool
  const activeLayerRef = useRef<SketchLayer | undefined>(undefined)
  const layersRef = useRef<SketchLayer[]>([])

  // Stable ref-based callbacks — avoids recreating downstream hooks / effects
  // every render (the inline arrow was a new identity each time).
  const setFeaturesRef = useRef<(updater: SetStateAction<SketchFeature[]>) => void>(() => {})
  const stableSetFeatures = useCallback(
    (updater: SetStateAction<SketchFeature[]>) => setFeaturesRef.current(updater),
    [],
  )

  const setSelectedFeatureIdRef = useRef<(id: string | null) => void>(() => {})
  const stableSetSelectedFeatureId = useCallback(
    (id: string | null) => setSelectedFeatureIdRef.current(id),
    [],
  )

  // ── Layer operations (extracted hook) ──────────────────────────────────────
  const {
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    syntheticCollapsed,
    addLayer,
    removeLayer,
    renameLayer,
    setLayerColour,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerCollapse,
  } = useLayerOps(viewer, stableSetFeatures)

  layersRef.current = layers

  // ── Feature operations (extracted hook) ────────────────────────────────────
  const featureState = useFeatureOps({ viewer, layersRef, layers, syntheticCollapsed })
  setFeaturesRef.current = featureState.setFeatures
  setSelectedFeatureIdRef.current = featureState.setSelectedFeatureId
  const {
    features,
    setFeatures,
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeature,
    featuresByLayer,
    addFeature,
    removeFeature,
    updateFeatureStyle,
    selectFeature,
    renameFeature,
    moveFeature,
  } = featureState

  // ── Preset loading ─────────────────────────────────────────────────────────

  const loadPreset = useCallback((preset: LayerPreset) => {
    const newLayers = preset.layers.map((def, i) =>
      makeSketchLayer(def.name, def.colour, i)
    )
    preset.layers.forEach((def, i) => {
      if (def.coordMode) newLayers[i].coordMode = def.coordMode
    })
    setLayers(newLayers)
    setActiveLayerId(newLayers[0]?.id ?? '')
    setFeatures([])
    setSelectedFeatureId(null)
  }, [setLayers, setActiveLayerId, setFeatures, setSelectedFeatureId])

  const allPresets = BUILTIN_PRESETS

  // ── Cancel tool ─────────────────────────────────────────────────────────────

  const cancelTool = useCallback(() => {
    setActiveTool(null)
  }, [])

  // ── Active layer helper ────────────────────────────────────────────────────

  const activeLayer = useMemo(
    () => layers.find(l => l.id === activeLayerId),
    [layers, activeLayerId],
  )
  activeLayerRef.current = activeLayer

  // ── Cancel tool when active layer is locked ─────────────────────────────────

  useEffect(() => {
    const tool = activeToolRef.current
    if ((activeLayer?.locked || activeLayer?.visible === false) && tool && tool !== 'select') {
      setActiveTool(null)
    }
  }, [activeLayer?.locked, activeLayer?.visible])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        if (activeToolRef.current) {
          e.stopPropagation()
          cancelTool()
        }
        return
      }

      const tool = TOOL_KEYS[e.key.toLowerCase()]
      if (tool) {
        if (!activeLayerRef.current || activeLayerRef.current.locked || !activeLayerRef.current.visible) return
        setActiveTool(prev => prev === tool ? null : tool)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [cancelTool])

  // ── Cesium entity click → selection ────────────────────────────────────────

  useEffect(() => {
    if (!viewer) return

    if (handlerRef.current) {
      handlerRef.current.destroy()
      handlerRef.current = null
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((click: { position: Cartesian2 }) => {
      if (activeToolRef.current && activeToolRef.current !== 'select') return
      const picked = viewer.scene.pick(click.position)
      if (defined(picked) && picked.id instanceof Entity) {
        const entityId = picked.id.id
        stableSetFeatures(current => {
          const feat = current.find(f => f.entityId === entityId)
            ?? current.find(f =>
              (f.geometry === 'box' || f.geometry === 'pit' || f.geometry === 'cylinder')
              && (entityId.startsWith(f.entityId + '_'))
            )
          if (feat) stableSetSelectedFeatureId(feat.id)
          return current
        })
      }
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy()
        handlerRef.current = null
      }
    }
  }, [viewer, stableSetFeatures, stableSetSelectedFeatureId])

  return {
    // Rail nav
    activeTab,
    setActiveTab,
    // Tool
    activeTool,
    setActiveTool,
    elevationConfig,
    setElevationConfig,
    // Layers
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    removeLayer,
    renameLayer,
    setLayerColour,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerCollapse,
    // Presets
    allPresets,
    loadPreset,
    // Active layer
    activeLayer,
    // Cancel
    cancelTool,
    // Solid draft
    solidDraft,
    setSolidDraft,
    // Traverse draft
    traverseDraft,
    setTraverseDraft,
    // Features
    features,
    selectedFeatureId,
    selectedFeature,
    featuresByLayer,
    addFeature,
    removeFeature,
    updateFeatureStyle,
    selectFeature,
    renameFeature,
    moveFeature,
  }
}
