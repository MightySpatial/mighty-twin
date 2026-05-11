/**
 * LayersTab — sketch gallery + layer list of the active sketch + voxel
 * layer section. The entry point for every sketch session.
 *
 * Layout (top → bottom):
 *
 *   1. Empty-state splash               — when no sketches exist yet
 *      (Start with a sketch · Blank | Redline · ↑ import .json)
 *
 *   2. Sketch gallery                   — tiles for each sketch + the
 *      Add / Redline tiles. Each tile has a gear → settings popover
 *      (rename · duplicate · default · CRS · datum · sites · download
 *      JSON · delete).
 *
 *   3. Schema preset selector           — only on blank sketches with
 *      no fields and no nodes; applies SCHEMA_PRESETS[key] via
 *      patchSketch({ fields }).
 *
 *   4. Layer list                       — colour swatch, name, visible
 *      / lock / delete; schema-edit on redline layers.
 *
 *   5. Voxel layers section             — list + level + render-mode
 *      controls bound to useSvoEngine.
 *
 * Wired modals:
 *   • RedlineCreationModal — Redline tile in the gallery
 *   • SchemaEditorModal    — Sliders button on each redline layer row
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  LayoutTemplate,
  Lock,
  Pencil,
  Plus,
  Settings,
  Sliders,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import { generateLayerId, generateNodeId } from '../../sketch/dagOps'
import { buildSketchDoc } from '../../sketch/persistence'
import { SCHEMA_PRESETS, SCHEMA_PRESET_ORDER, DEFAULT_PRESET_ID } from '../../sketch/schemaPresets'
import { useSvoEngine } from '../../voxel/useSvoEngine'
import { blockEdgeMeters, type SVOLayer, type SVORenderMode } from '../../voxel/types'
import RedlineCreationModal from '../modals/RedlineCreationModal'
import SchemaEditorModal from '../modals/SchemaEditorModal'
import type {
  SchemaField,
  Sketch,
  SketchDoc,
  SketchLayerSpec,
  SketchNode,
} from '../../sketch/types'
import { sketchKind } from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface DesignTemplate {
  id?: string
  name: string
  geometry?: 'point' | 'line' | 'polygon'
  colour?: string
  fields?: SchemaField[]
  values?: Record<string, unknown>
}

interface SiteListItem {
  id: string
  slug: string
  name: string
}

interface Props {
  siteSlug?: string | null
}

// ── Coordinate-system + height-datum options ────────────────────────────
//
// v1 stored these directly on the sketch (coordCrs / heightDatum). The
// dropdowns surface a short curated list rather than the full EPSG
// catalogue — the long list lives in the export modal where the user
// genuinely picks a target CRS for an export.

const CRS_OPTIONS: { value: string; label: string }[] = [
  { value: 'EPSG:4326',  label: 'WGS84 (Lon/Lat)' },
  { value: 'EPSG:28349', label: 'GDA94 MGA Zone 49' },
  { value: 'EPSG:28350', label: 'GDA94 MGA Zone 50' },
  { value: 'EPSG:28351', label: 'GDA94 MGA Zone 51' },
  { value: 'EPSG:28352', label: 'GDA94 MGA Zone 52' },
  { value: 'EPSG:28353', label: 'GDA94 MGA Zone 53' },
  { value: 'EPSG:28354', label: 'GDA94 MGA Zone 54' },
  { value: 'EPSG:28355', label: 'GDA94 MGA Zone 55' },
  { value: 'EPSG:28356', label: 'GDA94 MGA Zone 56' },
  { value: 'EPSG:7849',  label: 'GDA2020 MGA Zone 49' },
  { value: 'EPSG:7850',  label: 'GDA2020 MGA Zone 50' },
  { value: 'EPSG:7851',  label: 'GDA2020 MGA Zone 51' },
  { value: 'EPSG:7852',  label: 'GDA2020 MGA Zone 52' },
  { value: 'EPSG:7853',  label: 'GDA2020 MGA Zone 53' },
  { value: 'EPSG:7854',  label: 'GDA2020 MGA Zone 54' },
  { value: 'EPSG:7855',  label: 'GDA2020 MGA Zone 55' },
  { value: 'EPSG:7856',  label: 'GDA2020 MGA Zone 56' },
  { value: 'local',      label: 'Local ENU' },
]

type HeightDatum = Sketch['heightDatum']
const DATUM_OPTIONS: { value: HeightDatum; label: string }[] = [
  // Engine accepts these four literals today (see SketchType). The
  // visible labels surface common geodetic names — 'msl' covers
  // Sea Level / EGM2008 in practice for our consumers.
  { value: 'msl',          label: 'Sea Level (EGM2008)' },
  { value: 'ahd',          label: 'AHD' },
  { value: 'terrain',      label: 'AUSGeoid2020 (terrain)' },
  { value: 'ellipsoidal',  label: 'Ellipsoidal (WGS84)' },
]

// ── Voxel level dropdown ────────────────────────────────────────────────
//
// Level 0 = 12.5 cm; each step doubles. Spec V1_SPEC.md §1 caps at
// level 10 (= 128 m). Pretty-print each level so the user picks a real
// block size rather than an opaque integer.
const VOXEL_LEVELS = Array.from({ length: 11 }, (_, lvl) => lvl)

function voxelLevelLabel(level: number): string {
  const m = blockEdgeMeters(level)
  if (m < 1) {
    // 12.5 cm / 25 cm / 50 cm — fractional cm shown to one decimal.
    const cm = m * 100
    return `${cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1)} cm`
  }
  return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)} m`
}

const RENDER_MODES: { value: SVORenderMode; label: string }[] = [
  { value: 'solid',     label: 'Solid' },
  { value: 'textured',  label: 'Textured' },
  { value: 'raytrace',  label: 'Raytrace' },
  { value: 'wireframe', label: 'Wireframe' },
  { value: 'xray',      label: 'X-ray' },
]

export default function LayersTab({ siteSlug = null }: Props) {
  const sketches = useCadEngine(s => s.sketches)
  const allNodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)

  const createSketch = useCadEngine(s => s.createSketch)
  const deleteSketch = useCadEngine(s => s.deleteSketch)
  const setActiveSketch = useCadEngine(s => s.setActiveSketch)
  const renameSketch = useCadEngine(s => s.renameSketch)
  const patchSketch = useCadEngine(s => s.patchSketch)

  const addLayer = useCadEngine(s => s.addLayer)
  const removeLayer = useCadEngine(s => s.removeLayer)
  const renameLayer = useCadEngine(s => s.renameLayer)
  const setLayerColour = useCadEngine(s => s.setLayerColour)
  const toggleLayerVisibility = useCadEngine(s => s.toggleLayerVisibility)
  const toggleLayerLock = useCadEngine(s => s.toggleLayerLock)
  const setActiveLayer = useCadEngine(s => s.setActiveLayer)

  const addNode = useCadEngine(s => s.addNode)

  // Voxel engine — only the slices the layer panel needs.
  const voxelLayers = useSvoEngine(s => s.layers)
  const activeVoxelLayerId = useSvoEngine(s => s.activeLayerId)
  const activeVoxelLevel = useSvoEngine(s => s.activeLevel)
  const voxelRenderMode = useSvoEngine(s => s.renderMode)
  const addVoxelLayer = useSvoEngine(s => s.addLayer)
  const setActiveVoxelLayer = useSvoEngine(s => s.setActiveLayer)
  const setVoxelLevel = useSvoEngine(s => s.setActiveLevel)
  const setVoxelRenderMode = useSvoEngine(s => s.setRenderMode)

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [redlineModalOpen, setRedlineModalOpen] = useState(false)

  // Unified layer list state — which row (drawing or voxel) is
  // currently inline-expanded. Only one row open at a time so the
  // list stays scannable. Storing the id alone (not a discriminator)
  // is OK because drawing and voxel layer ids are uuid-disjoint.
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null)
  // "Add layer" inline picker — Drawing | Voxel.
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  // Per-voxel-layer accordions for the heavier secondary sections
  // (Datum coords, Generators). Datum + generators don't fit on the
  // 280 px wide sidebar without collapsing.
  const [voxelDatumOpenId, setVoxelDatumOpenId] = useState<string | null>(null)
  const [voxelGenOpenId, setVoxelGenOpenId] = useState<string | null>(null)
  // Collapsed groups in the gallery — keyed by groupId. Groups
  // default to expanded; the user collapses them via the header
  // chevron and the state lives only on the client (per-mount).
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set())

  // Sketch settings popover — id of the sketch whose gear is open.
  const [popoverSketchId, setPopoverSketchId] = useState<string | null>(null)
  const [popoverNameDraft, setPopoverNameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Schema editor modal — the redline layer whose schema is being edited.
  const [schemaEditorLayerId, setSchemaEditorLayerId] = useState<string | null>(null)

  // Preset selector (site templates) — top-of-gallery dropdown.
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const presetMenuRef = useRef<HTMLDivElement | null>(null)

  // Sites for the popover's site-affinity picker. Loaded the first time
  // any settings popover opens.
  const [sitesList, setSitesList] = useState<SiteListItem[]>([])
  const [sitesLoaded, setSitesLoaded] = useState(false)

  // Hidden file input for .json import — driven from the empty-state.
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const sketchList = Object.values(sketches)
  const activeSketch = activeSketchId ? sketches[activeSketchId] : null

  // Has the active sketch produced any nodes yet? Used to gate the
  // schema-preset selector — we only show it on truly blank sketches
  // to avoid silently rewriting a populated schema.
  const activeSketchHasNodes = useMemo(() => {
    if (!activeSketchId) return false
    for (const n of Object.values(allNodes)) {
      if (n.params.sketchId === activeSketchId) return true
    }
    return false
  }, [allNodes, activeSketchId])

  // ── Effects ──────────────────────────────────────────────────────────

  // Voxel sketch ↔ engine sync. Two effects rather than one so each
  // direction can react independently (otherwise the bidirectional
  // update fights itself on first paint).
  useEffect(() => {
    if (!activeSketchId) return
    const sk = sketches[activeSketchId]
    if (!sk || sketchKind(sk) !== 'voxel') return
    if (typeof sk.voxelLevel === 'number' && sk.voxelLevel !== activeVoxelLevel) {
      setVoxelLevel(sk.voxelLevel)
    }
    if (sk.voxelRenderMode && sk.voxelRenderMode !== voxelRenderMode) {
      setVoxelRenderMode(sk.voxelRenderMode)
    }
    // Intentionally only depends on activeSketchId — we want to
    // hydrate engine ← sketch when the active sketch changes, not
    // when the user mutates engine globals (that's the inverse
    // direction handled below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSketchId])

  useEffect(() => {
    if (!activeSketchId) return
    const sk = sketches[activeSketchId]
    if (!sk || sketchKind(sk) !== 'voxel') return
    if (sk.voxelLevel !== activeVoxelLevel || sk.voxelRenderMode !== voxelRenderMode) {
      patchSketch(activeSketchId, {
        voxelLevel: activeVoxelLevel,
        voxelRenderMode,
      })
    }
  }, [activeSketchId, activeVoxelLevel, voxelRenderMode, sketches, patchSketch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPopoverSketchId(null)
      setConfirmDeleteId(null)
      setPresetMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lazy-load templates the first time the preset menu opens.
  useEffect(() => {
    if (!presetMenuOpen || !siteSlug || templatesLoaded || templatesLoading) return
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/sites/${siteSlug}/design-templates`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (!r.ok) throw new Error(`templates ${r.status}`)
        return r.json() as Promise<{ templates?: DesignTemplate[] }>
      })
      .then(data => {
        if (cancelled) return
        setTemplates(data.templates ?? [])
        setTemplatesLoaded(true)
      })
      .catch(e => {
        if (!cancelled) setTemplatesError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => { cancelled = true }
  }, [presetMenuOpen, siteSlug, templatesLoaded, templatesLoading])

  // Lazy-load the sites list the first time any settings popover opens.
  // Hits /api/spatial/sites (the v2 endpoint — /api/sites in the brief
  // is the v1 path; the v2 backend mounts the same list under
  // /api/spatial/sites).
  useEffect(() => {
    if (!popoverSketchId || sitesLoaded) return
    let cancelled = false
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/spatial/sites`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.json() : []))
      .then((data: SiteListItem[]) => {
        if (cancelled) return
        setSitesList(Array.isArray(data) ? data : [])
        setSitesLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSitesLoaded(true)
      })
    return () => { cancelled = true }
  }, [popoverSketchId, sitesLoaded])

  // Click-outside closes the preset dropdown.
  useEffect(() => {
    if (!presetMenuOpen) return
    const onClick = (e: MouseEvent) => {
      const root = presetMenuRef.current
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setPresetMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [presetMenuOpen])

  // ── Helpers ──────────────────────────────────────────────────────────

  function startBlankSketch(kind: import('../../sketch/types').SketchKind = 'cad') {
    const targetSiteId = siteSlug || '__local__'
    const prefix = kind === 'voxel' ? 'Voxel sketch'
                 : kind === 'redline' ? 'Redline sketch'
                 : 'Sketch'
    const newId = createSketch({
      name: `${prefix} ${sketchList.length + 1}`,
      siteId: targetSiteId,
      kind,
    })
    // Seed the new sketch with the default materials preset's
    // schema — matches the design widget mockup palette and stops
    // every fresh sketch from launching with an empty fields list.
    // Users can switch to Blank via the preset dropdown.
    const defaultPreset = SCHEMA_PRESETS[DEFAULT_PRESET_ID]
    if (defaultPreset.fields.length > 0) {
      patchSketch(newId, { fields: defaultPreset.fields })
    }
  }

  function commitLayerRename() {
    if (activeSketchId && editingLayerId && editingLayerName.trim()) {
      renameLayer(activeSketchId, editingLayerId, editingLayerName.trim())
    }
    setEditingLayerId(null)
  }

  function openSettingsPopover(sketch: Sketch) {
    setPopoverSketchId(sketch.id)
    setPopoverNameDraft(sketch.name)
    setConfirmDeleteId(null)
  }

  function closeSettingsPopover() {
    setPopoverSketchId(null)
    setConfirmDeleteId(null)
  }

  function commitPopoverRename(sketchId: string) {
    const name = popoverNameDraft.trim()
    if (name) renameSketch(sketchId, name)
  }

  /** Copy every node pinned to `sourceId` into `newId`, generating
   *  fresh node ids and remapping `params.sketchLayer` through `layerMap`.
   *  Used by both `duplicateSketch` and `importSketchFromJson`. */
  function copyNodesInto(
    sourceId: string,
    newId: string,
    layerMap: Map<string, string>,
    fallbackLayerId: string,
    sourceNodes?: SketchNode[],
  ): void {
    const nodes = sourceNodes
      ?? Object.values(useCadEngine.getState().nodes).filter(
        n => n.params.sketchId === sourceId,
      )
    for (const node of nodes) {
      const oldLayerId = node.params.sketchLayer ?? ''
      const newLayerId = layerMap.get(oldLayerId) ?? fallbackLayerId
      addNode({
        ...node,
        id: generateNodeId(),
        params: {
          ...node.params,
          sketchId: newId,
          sketchLayer: newLayerId,
        },
        attributes: { ...node.attributes },
        style: { ...node.style },
      })
    }
  }

  /** Duplicate a sketch — copies metadata, layers (with fresh ids), and
   *  every node pinned to the source sketch (with fresh ids + remapped
   *  layer references). */
  function duplicateSketch(sourceId: string) {
    const source = useCadEngine.getState().sketches[sourceId]
    if (!source) return

    const targetSiteId = source.siteIds[0] ?? siteSlug ?? '__local__'
    const newId = createSketch({
      name: `${source.name} (copy)`,
      siteId: targetSiteId,
    })

    const firstNewLayerId = useCadEngine.getState().sketches[newId]?.layers[0]?.id
    if (!firstNewLayerId) return

    const layerMap = new Map<string, string>()
    const newLayers: SketchLayerSpec[] = source.layers.map((srcLayer, idx) => {
      const targetId = idx === 0
        ? firstNewLayerId
        : addLayer(newId, {
            name: srcLayer.name,
            colour: srcLayer.colour,
            visible: srcLayer.visible,
            locked: srcLayer.locked,
            coordMode: srcLayer.coordMode,
          })
      layerMap.set(srcLayer.id, targetId)
      return { ...srcLayer, id: targetId }
    })

    patchSketch(newId, {
      layers: newLayers,
      activeLayerId: newLayers[0]?.id ?? '',
      coordMode: source.coordMode,
      coordCrs: source.coordCrs,
      heightDatum: source.heightDatum,
      localOrigin: { ...source.localOrigin },
      localRotation: source.localRotation,
      fields: source.fields.map(f => ({ ...f })),
      siteIds: [...source.siteIds],
    })

    const fallbackLayerId = newLayers[0]?.id ?? ''
    copyNodesInto(sourceId, newId, layerMap, fallbackLayerId)
  }

  /** Download the active sketch + its nodes as a single .json file —
   *  mirrors the on-disk shape persistence.ts uses, so a downloaded
   *  file round-trips cleanly through the .json importer below. */
  function downloadSketchJson(sketchId: string) {
    const state = useCadEngine.getState()
    const sketch = state.sketches[sketchId]
    if (!sketch) return
    const siteId = sketch.siteIds[0] ?? siteSlug ?? '__local__'
    const doc = buildSketchDoc(siteId, sketch, state.nodes)
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = sketch.name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()
    a.download = `sketch-${safeName || sketch.id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** Import a SketchDoc-shaped JSON file into the engine. Reuses the
   *  node-copy machinery so imported features land as a brand-new
   *  sketch (fresh ids, remapped layers) and never collide with
   *  whatever's already in the store. */
  async function importSketchFromFile(file: File) {
    setImportError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<SketchDoc>
      const source = parsed?.sketch
      if (!source || !Array.isArray(parsed.nodes)) {
        throw new Error('Not a sketch JSON (missing sketch / nodes)')
      }

      const targetSiteId = siteSlug || source.siteIds?.[0] || '__local__'
      const newId = createSketch({
        name: source.name || file.name.replace(/\.json$/i, ''),
        siteId: targetSiteId,
      })

      // Rebuild the layer list. createSketch produced one default
      // layer; we reuse its id as the mapping target for the source's
      // first layer, then addLayer for the rest.
      const firstNewLayerId = useCadEngine.getState().sketches[newId]?.layers[0]?.id
      if (!firstNewLayerId) throw new Error('createSketch returned no layer')

      const layerMap = new Map<string, string>()
      const srcLayers = source.layers ?? []
      const newLayers: SketchLayerSpec[] = srcLayers.map((srcLayer, idx) => {
        const targetId = idx === 0
          ? firstNewLayerId
          : addLayer(newId, {
              name: srcLayer.name,
              colour: srcLayer.colour,
              visible: srcLayer.visible,
              locked: srcLayer.locked,
              coordMode: srcLayer.coordMode,
            })
        layerMap.set(srcLayer.id, targetId)
        return { ...srcLayer, id: targetId }
      })

      // Build the patch piecewise so we never spread an `undefined` onto
      // a non-optional field (patchSketch is a shallow merge — undefined
      // clobbers).
      const patch: Partial<Sketch> = {
        activeLayerId: newLayers[0]?.id ?? firstNewLayerId,
        fields: (source.fields ?? []).map(f => ({ ...f })),
      }
      if (newLayers.length) patch.layers = newLayers
      if (source.coordMode) patch.coordMode = source.coordMode
      if (source.coordCrs) patch.coordCrs = source.coordCrs
      if (source.heightDatum) patch.heightDatum = source.heightDatum
      if (source.localOrigin) patch.localOrigin = { ...source.localOrigin }
      if (typeof source.localRotation === 'number') patch.localRotation = source.localRotation
      if (source.siteIds?.length) patch.siteIds = [...source.siteIds]
      patchSketch(newId, patch)

      const fallbackLayerId = newLayers[0]?.id ?? firstNewLayerId
      copyNodesInto(source.id ?? '', newId, layerMap, fallbackLayerId, parsed.nodes)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Invalid sketch JSON')
    }
  }

  function setAsDefault(sketchId: string) {
    const all = useCadEngine.getState().sketches
    for (const id of Object.keys(all)) {
      const cur = all[id]
      if (id === sketchId) {
        if (!cur.isDefault) patchSketch(id, { isDefault: true })
      } else if (cur.isDefault) {
        patchSketch(id, { isDefault: false })
      }
    }
  }

  function applyPreset(template: DesignTemplate) {
    const targetSiteId = siteSlug || '__local__'
    const newId = createSketch({
      name: template.name || 'Preset sketch',
      siteId: targetSiteId,
    })
    const fresh = useCadEngine.getState().sketches[newId]
    if (!fresh) return

    const firstLayer = fresh.layers[0]
    const layers = (firstLayer && template.colour)
      ? fresh.layers.map(l => l.id === firstLayer.id ? { ...l, colour: template.colour! } : l)
      : fresh.layers

    patchSketch(newId, {
      layers,
      fields: (template.fields ?? []).map(f => ({ ...f })),
    })
    setPresetMenuOpen(false)
  }

  /** Apply a built-in SCHEMA_PRESETS entry to the active sketch's
   *  `fields[]`. Only enabled when the sketch is blank (no nodes). */
  function applySchemaPreset(presetId: string) {
    if (!activeSketchId) return
    const preset = SCHEMA_PRESETS[presetId as keyof typeof SCHEMA_PRESETS]
    if (!preset) return
    patchSketch(activeSketchId, {
      fields: preset.fields.map(f => ({ ...f })),
    })
  }

  /** Toggle a site in the sketch's affinity list. Empty list is allowed
   *  (private / unassigned); the engine doesn't enforce non-emptiness. */
  function toggleSiteAffinity(sketchId: string, slug: string) {
    const cur = useCadEngine.getState().sketches[sketchId]
    if (!cur) return
    const set = new Set(cur.siteIds)
    if (set.has(slug)) set.delete(slug)
    else set.add(slug)
    patchSketch(sketchId, { siteIds: Array.from(set) })
  }

  function setAllSites(sketchId: string, on: boolean) {
    if (!on) {
      patchSketch(sketchId, { siteIds: [] })
      return
    }
    patchSketch(sketchId, { siteIds: sitesList.map(s => s.slug) })
  }

  /** Stamp a new voxel layer scoped to the active sketch. Uses the
   *  sketch's localOrigin as the ENU datum so the grid anchors at a
   *  sensible point (and the user can move it later from the voxel
   *  panel). */
  function createVoxelLayer() {
    if (!activeSketch) return
    const layer: SVOLayer = {
      id: generateLayerId(),
      name: `Voxel layer ${voxelLayers.length + 1}`,
      siteSlug: siteSlug || activeSketch.siteIds[0] || '__local__',
      scope: 'sketch',
      datum: {
        lon: activeSketch.localOrigin?.lon ?? 0,
        lat: activeSketch.localOrigin?.lat ?? 0,
        alt: activeSketch.localOrigin?.alt ?? 0,
      },
      generators: [],
    }
    addVoxelLayer(layer)
    setActiveVoxelLayer(layer.id)
  }

  // ── Render ───────────────────────────────────────────────────────────

  const popoverSketch = popoverSketchId ? sketches[popoverSketchId] : null
  const isRedlineSketch = !!activeSketch?.redline
  const isEmptyGallery = sketchList.length === 0
  const showSchemaPresetPicker = !!activeSketch
    && !activeSketch.redline
    && (activeSketch.fields?.length ?? 0) === 0
    && !activeSketchHasNodes

  return (
    <div className="layers-tab">
      {/* ── 1 · Empty-state splash ───────────────────────────────────── */}
      {isEmptyGallery ? (
        <div className="layers-empty">
          <div className="layers-empty__title">Start with a sketch</div>
          <p className="layers-empty__sub">
            A sketch is your design canvas. Drop into a redline to update
            real site data with schema guard rails.
          </p>
          <div className="layers-empty__tiles">
            <button
              type="button"
              className="layers-empty__tile layers-empty__tile--blank"
              onClick={() => startBlankSketch('cad')}
            >
              <Plus size={18} />
              <span className="layers-empty__tile-name">CAD sketch</span>
              <span className="layers-empty__tile-sub">
                Vector drawing layers — strokes, shapes, annotations.
              </span>
            </button>
            <button
              type="button"
              className="layers-empty__tile layers-empty__tile--blank"
              onClick={() => startBlankSketch('voxel')}
            >
              <Plus size={18} />
              <span className="layers-empty__tile-name">Voxel sketch</span>
              <span className="layers-empty__tile-sub">
                3D block grid — terrain, water, generated volumes.
              </span>
            </button>
            {siteSlug && (
              <button
                type="button"
                className="layers-empty__tile layers-empty__tile--redline"
                onClick={() => setRedlineModalOpen(true)}
              >
                <Pencil size={18} />
                <span className="layers-empty__tile-name">Redline</span>
                <span className="layers-empty__tile-sub">
                  Update site data. Schema locked to target.
                </span>
              </button>
            )}
          </div>
          <div className="layers-empty__import">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void importSketchFromFile(f)
                if (e.target) e.target.value = ''
              }}
            />
            <button
              type="button"
              className="layers-empty__import-btn"
              onClick={() => importInputRef.current?.click()}
            >
              ↑ or import a .json
            </button>
            {importError && (
              <p className="layers-empty__import-err">{importError}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── 2 · Gallery + preset menu header ───────────────────── */}
          <div className="layers-tab__hd-row">
            <div className="layers-tab__hd">Sketches</div>
            {siteSlug && (
              <div className="preset-menu" ref={presetMenuRef}>
                <button
                  type="button"
                  className="preset-menu__btn"
                  onClick={() => setPresetMenuOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={presetMenuOpen}
                >
                  <LayoutTemplate size={14} />
                  <span>Load preset</span>
                  <ChevronDown size={12} />
                </button>
                {presetMenuOpen && (
                  <div className="preset-menu__pop" role="menu">
                    <div className="preset-menu__hd">Site templates</div>
                    {templatesLoading && (
                      <div className="preset-menu__msg">Loading…</div>
                    )}
                    {templatesError && (
                      <div className="preset-menu__msg preset-menu__msg--err">
                        {templatesError}
                      </div>
                    )}
                    {!templatesLoading && !templatesError && templates.length === 0 && (
                      <div className="preset-menu__msg">
                        No templates yet. Save one from the Attributes editor
                        to start a library.
                      </div>
                    )}
                    {!templatesLoading && !templatesError && templates.map((t, i) => (
                      <button
                        key={t.id ?? `tpl-${i}`}
                        type="button"
                        className="preset-menu__item"
                        onClick={() => applyPreset(t)}
                        role="menuitem"
                      >
                        <span
                          className="preset-menu__dot"
                          style={t.colour ? { background: t.colour } : undefined}
                        />
                        <span className="preset-menu__name">{t.name}</span>
                        <span className="preset-menu__meta">
                          {t.geometry ?? 'any'} · {t.fields?.length ?? 0} fields
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sketch-gallery">
            {/* Group-aware iteration — sketches are sorted so
                ungrouped come first, then groups (alphabetised by
                groupName) with their members. A group header
                Fragment is emitted alongside the first member of
                each group; collapsed groups still emit the header
                but skip the per-sketch tiles. */}
            {(() => {
              const sorted = [...sketchList].sort((a, b) => {
                const ag = a.groupName ?? ''
                const bg = b.groupName ?? ''
                if (ag !== bg) return ag.localeCompare(bg)
                return a.name.localeCompare(b.name)
              })
              let prevGroupId: string | null | undefined = undefined
              return sorted.map(s => {
                const gid = s.groupId ?? null
                const header = (gid !== prevGroupId && gid != null) ? gid : null
                prevGroupId = gid
                const collapsed = gid != null && collapsedGroupIds.has(gid)
                const memberCount = gid != null ? sorted.filter(x => x.groupId === gid).length : 0
              return (
                <React.Fragment key={`row-${s.id}`}>
                  {header && (
                    <button
                      type="button"
                      key={`hdr-${header}`}
                      className={`sketch-group-hdr${collapsed ? ' is-collapsed' : ''}`}
                      onClick={() => setCollapsedGroupIds(prev => {
                        const next = new Set(prev)
                        if (next.has(header)) next.delete(header)
                        else next.add(header)
                        return next
                      })}
                      aria-expanded={!collapsed}
                    >
                      <span className="sketch-group-hdr__caret">
                        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                      </span>
                      <span className="sketch-group-hdr__name">{s.groupName}</span>
                      <span className="sketch-group-hdr__count">
                        {memberCount} sketch{memberCount === 1 ? '' : 'es'}
                      </span>
                    </button>
                  )}
                  {!collapsed && (() => {
              const isActive = s.id === activeSketchId
              const isRedline = !!s.redline
              const isDefault = !!s.isDefault
              const popoverOpen = popoverSketchId === s.id
              return (
                <div
                  key={s.id}
                  className={`sketch-tile${isActive ? ' is-active' : ''}${isRedline ? ' is-redline' : ''}${isDefault ? ' is-default' : ''}${popoverOpen ? ' has-settings-open' : ''}`}
                  onClick={() => setActiveSketch(s.id)}
                >
                  <div className="sketch-tile__title">
                    <span className="sketch-tile__name">{s.name}</span>
                    {isDefault && (
                      <span className="sketch-tile__default-badge" title="Default sketch">
                        <Star size={9} fill="currentColor" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="sketch-tile__meta">
                    {s.layers.length} layer{s.layers.length === 1 ? '' : 's'}
                    {/* Kind badge — CAD / Redline / Voxel. Always
                        rendered so the sketch type is visible at a
                        glance; colour-coded so users learn the type
                        signature quickly. */}
                    <span className={`sketch-tile__kind-badge kind-${sketchKind(s)}`}>
                      {sketchKind(s) === 'cad' ? 'CAD'
                        : sketchKind(s) === 'redline' ? 'Redline'
                        : 'Voxel'}
                    </span>
                  </div>

                  <button
                    className="sketch-tile__settings"
                    title="Sketch settings"
                    aria-label="Sketch settings"
                    aria-haspopup="menu"
                    aria-expanded={popoverOpen}
                    onClick={e => {
                      e.stopPropagation()
                      if (popoverOpen) closeSettingsPopover()
                      else openSettingsPopover(s)
                    }}
                  >
                    <Settings size={14} />
                  </button>

                  {popoverOpen && popoverSketch && (
                    <div
                      className="sketch-popover"
                      role="menu"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="sketch-popover__hd">
                        <span>Sketch settings</span>
                        <button
                          type="button"
                          className="sketch-popover__close"
                          title="Close"
                          aria-label="Close"
                          onClick={closeSettingsPopover}
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <label className="sketch-popover__field">
                        <span className="sketch-popover__field-label">Name</span>
                        <input
                          autoFocus
                          className="sketch-popover__input"
                          value={popoverNameDraft}
                          onChange={e => setPopoverNameDraft(e.target.value)}
                          onBlur={() => commitPopoverRename(popoverSketch.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              commitPopoverRename(popoverSketch.id)
                              closeSettingsPopover()
                            }
                          }}
                        />
                      </label>

                      {/* CRS */}
                      <label className="sketch-popover__field">
                        <span className="sketch-popover__field-label">Coordinate system</span>
                        <select
                          className="sketch-popover__input"
                          value={popoverSketch.coordCrs}
                          onChange={e => patchSketch(popoverSketch.id, { coordCrs: e.target.value })}
                        >
                          {CRS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>

                      {/* Group — putting sketches into a named folder.
                          Sketches sharing the same groupName render
                          under one header in the gallery. Clearing the
                          field removes the sketch from its group. */}
                      <label className="sketch-popover__field">
                        <span className="sketch-popover__field-label">Group</span>
                        <input
                          className="sketch-popover__input"
                          type="text"
                          value={popoverSketch.groupName ?? ''}
                          placeholder="e.g. Terminal Building"
                          onChange={e => {
                            const name = e.target.value
                            if (!name.trim()) {
                              patchSketch(popoverSketch.id, {
                                groupId: undefined,
                                groupName: undefined,
                              })
                              return
                            }
                            // Stable groupId from the slugified name
                            // so re-typing the same name reuses the
                            // group rather than creating a parallel
                            // empty one.
                            const groupId = name.trim().toLowerCase().replace(/\s+/g, '-')
                            patchSketch(popoverSketch.id, { groupId, groupName: name })
                          }}
                        />
                      </label>

                      {/* Height datum */}
                      <label className="sketch-popover__field">
                        <span className="sketch-popover__field-label">Height datum</span>
                        <select
                          className="sketch-popover__input"
                          value={popoverSketch.heightDatum}
                          onChange={e => patchSketch(popoverSketch.id, {
                            heightDatum: e.target.value as HeightDatum,
                          })}
                        >
                          {DATUM_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>

                      {/* Site affinity */}
                      {sitesList.length > 0 && (
                        <div className="sketch-popover__field">
                          <span className="sketch-popover__field-label">Sites</span>
                          <div className="sketch-popover__sites">
                            <label className="sketch-popover__site-row">
                              <input
                                type="checkbox"
                                checked={popoverSketch.siteIds.length === sitesList.length}
                                onChange={e => setAllSites(popoverSketch.id, e.target.checked)}
                              />
                              <span>All sites</span>
                            </label>
                            {sitesList.map(site => (
                              <label key={site.slug} className="sketch-popover__site-row">
                                <input
                                  type="checkbox"
                                  checked={popoverSketch.siteIds.includes(site.slug)}
                                  onChange={() => toggleSiteAffinity(popoverSketch.id, site.slug)}
                                />
                                <span>{site.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="sketch-popover__item"
                        onClick={() => {
                          duplicateSketch(popoverSketch.id)
                          closeSettingsPopover()
                        }}
                      >
                        <Copy size={14} />
                        <span>Duplicate sketch</span>
                      </button>

                      <button
                        type="button"
                        className="sketch-popover__item"
                        onClick={() => {
                          downloadSketchJson(popoverSketch.id)
                        }}
                      >
                        <Download size={14} />
                        <span>Download JSON</span>
                      </button>

                      <button
                        type="button"
                        className={`sketch-popover__item${popoverSketch.isDefault ? ' is-on' : ''}`}
                        onClick={() => {
                          setAsDefault(popoverSketch.id)
                          closeSettingsPopover()
                        }}
                        disabled={popoverSketch.isDefault}
                      >
                        <Star size={14} fill={popoverSketch.isDefault ? 'currentColor' : 'none'} />
                        <span>{popoverSketch.isDefault ? 'Default sketch' : 'Set as default'}</span>
                      </button>

                      <div className="sketch-popover__sep" />

                      {confirmDeleteId === popoverSketch.id ? (
                        <div className="sketch-popover__confirm-row">
                          <button
                            type="button"
                            className="sketch-popover__confirm-yes"
                            onClick={() => {
                              deleteSketch(popoverSketch.id)
                              setConfirmDeleteId(null)
                              setPopoverSketchId(null)
                            }}
                          >
                            Delete permanently
                          </button>
                          <button
                            type="button"
                            className="sketch-popover__confirm-no"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="sketch-popover__item sketch-popover__item--danger"
                          onClick={() => setConfirmDeleteId(popoverSketch.id)}
                        >
                          <Trash2 size={14} />
                          <span>Delete sketch</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
                </React.Fragment>
              )
              })
            })()}
            {/* New-sketch type picker — three tiles, one per kind.
                Compact (no expanded popover) since each option is a
                single named action. Redline preserves the dedicated
                "Redline…" modal entry below (which wires the
                target-data-source picker); creating a blank redline
                without a target is rarely useful, so we hide the
                "blank redline" tile when the modal exists. */}
            <button
              className="sketch-tile sketch-tile--add"
              onClick={() => startBlankSketch('cad')}
              title="CAD sketch — vector drawing layers"
            >
              <Plus size={18} /> <span>New CAD sketch</span>
            </button>
            <button
              className="sketch-tile sketch-tile--add"
              onClick={() => startBlankSketch('voxel')}
              title="Voxel sketch — 3D block grid"
            >
              <Plus size={18} /> <span>New voxel sketch</span>
            </button>
            {siteSlug && (
              <button className="sketch-tile sketch-tile--redline" onClick={() => setRedlineModalOpen(true)}>
                Redline
              </button>
            )}
          </div>
        </>
      )}

      {/* ── 3 · Schema-preset selector + 4 · Layer list ────────────── */}
      {activeSketch && (
        <>
          {showSchemaPresetPicker && (
            <div className="schema-preset-row">
              <span className="schema-preset-row__label">Apply schema preset</span>
              <select
                className="schema-preset-row__select"
                defaultValue=""
                onChange={e => {
                  const v = e.target.value
                  if (!v) return
                  applySchemaPreset(v)
                  // Reset to placeholder so re-selecting the same
                  // preset re-applies (e.g. after the user added a
                  // field and wants the canonical set back).
                  e.target.value = ''
                }}
              >
                <option value="">→ Choose a preset…</option>
                {SCHEMA_PRESET_ORDER.map(id => {
                  const p = SCHEMA_PRESETS[id]
                  return (
                    <option key={id} value={id}>
                      {p.label} — {p.description}
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {/* Voxel sketch preamble — block size + render mode live
              at the SKETCH level (not per-layer) per the typed-sketch
              spec. Renders only when the active sketch is a voxel
              sketch; the engine's global state is kept in sync via
              the effects above. */}
          {sketchKind(activeSketch) === 'voxel' && (
            <div className="voxel-sketch-prefs">
              <div className="layers-tab__hd">Voxel settings · {activeSketch.name}</div>
              <label className="voxel-control-row">
                <span className="voxel-control-row__label">Block size</span>
                <select
                  className="voxel-control-row__select"
                  value={activeVoxelLevel}
                  onChange={e => setVoxelLevel(Number(e.target.value))}
                >
                  {VOXEL_LEVELS.map(lvl => (
                    <option key={lvl} value={lvl}>
                      {voxelLevelLabel(lvl)} (level {lvl})
                    </option>
                  ))}
                </select>
              </label>
              <div className="voxel-control-row">
                <span className="voxel-control-row__label">Render mode</span>
                <div className="voxel-mode-toggle" role="group" aria-label="Render mode">
                  {RENDER_MODES.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      className={`voxel-mode-toggle__btn${voxelRenderMode === m.value ? ' is-on' : ''}`}
                      onClick={() => setVoxelRenderMode(m.value)}
                      aria-pressed={voxelRenderMode === m.value}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="layers-tab__hd">Layers · {activeSketch.name}</div>
          <div className="sketch-layer-list">
            {/* Drawing (vector) layers */}
            {activeSketch.layers.map(layer => {
              const isLayerActive = layer.id === activeLayerId
              const isExpanded = expandedLayerId === layer.id
              return (
                <div
                  key={layer.id}
                  className={`unified-layer-item${isLayerActive ? ' active' : ''}${!layer.visible ? ' hidden-layer' : ''}${isExpanded ? ' is-expanded' : ''}`}
                >
                  <div
                    className="unified-layer-row"
                    onClick={() => {
                      setActiveLayer(layer.id)
                      setExpandedLayerId(prev => prev === layer.id ? null : layer.id)
                    }}
                  >
                    <span className="unified-layer-twirl" aria-hidden>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    <span className="unified-layer-type" title="Drawing layer">
                      <Pencil size={13} />
                    </span>
                    <span className="unified-layer-swatch" style={{ background: layer.colour }} />
                    {editingLayerId === layer.id ? (
                      <input
                        className="sketch-layer-name-edit"
                        autoFocus
                        value={editingLayerName}
                        onChange={e => setEditingLayerName(e.target.value)}
                        onBlur={commitLayerRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitLayerRename()
                          if (e.key === 'Escape') setEditingLayerId(null)
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="unified-layer-name"
                        onDoubleClick={e => {
                          e.stopPropagation()
                          setEditingLayerId(layer.id)
                          setEditingLayerName(layer.name)
                        }}
                      >{layer.name}</span>
                    )}
                    <div className="unified-layer-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="sketch-layer-action-btn"
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                        onClick={() => toggleLayerVisibility(activeSketch.id, layer.id)}
                      >
                        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        className="sketch-layer-action-btn"
                        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                        onClick={() => toggleLayerLock(activeSketch.id, layer.id)}
                      >
                        {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="unified-layer-body" onClick={e => e.stopPropagation()}>
                      <div className="unified-layer-prop">
                        <span className="unified-layer-prop__label">Colour</span>
                        <label className="sketch-layer-colour-wrap">
                          <input
                            type="color"
                            className="sketch-layer-colour-input"
                            value={layer.colour}
                            onChange={e => setLayerColour(activeSketch.id, layer.id, e.target.value)}
                          />
                          <span className="sketch-layer-colour-dot" style={{ background: layer.colour }} />
                        </label>
                      </div>
                      <div className="unified-layer-body__actions">
                        {isRedlineSketch && (
                          <button
                            type="button"
                            className="unified-layer-body__btn"
                            onClick={() => setSchemaEditorLayerId(layer.id)}
                          >
                            <Sliders size={12} /> Edit schema
                          </button>
                        )}
                        {activeSketch.layers.length > 1 && (
                          <button
                            type="button"
                            className="unified-layer-body__btn danger"
                            onClick={() => removeLayer(activeSketch.id, layer.id)}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Voxel layers — same row shape, cube icon, richer body */}
            {voxelLayers.map(vlayer => {
              const isActive = vlayer.id === activeVoxelLayerId
              const isExpanded = expandedLayerId === vlayer.id
              const datumOpen = voxelDatumOpenId === vlayer.id
              const genOpen = voxelGenOpenId === vlayer.id
              return (
                <div
                  key={vlayer.id}
                  className={`unified-layer-item voxel${isActive ? ' active' : ''}${isExpanded ? ' is-expanded' : ''}`}
                >
                  <div
                    className="unified-layer-row"
                    onClick={() => {
                      setActiveVoxelLayer(vlayer.id)
                      setExpandedLayerId(prev => prev === vlayer.id ? null : vlayer.id)
                    }}
                  >
                    <span className="unified-layer-twirl" aria-hidden>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                    <span className="unified-layer-type" title="Voxel layer">
                      <Box size={13} />
                    </span>
                    <span className="unified-layer-name">{vlayer.name}</span>
                    <span className="unified-layer-badge">
                      {voxelLevelLabel(activeVoxelLevel)}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="unified-layer-body" onClick={e => e.stopPropagation()}>
                      <div className="unified-layer-prop">
                        <span className="unified-layer-prop__label">Block size</span>
                        <select
                          className="voxel-control-row__select"
                          value={activeVoxelLevel}
                          onChange={e => setVoxelLevel(Number(e.target.value))}
                        >
                          {VOXEL_LEVELS.map(lvl => (
                            <option key={lvl} value={lvl}>
                              {voxelLevelLabel(lvl)} (level {lvl})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="unified-layer-prop">
                        <span className="unified-layer-prop__label">Render mode</span>
                        <div className="voxel-mode-toggle" role="group" aria-label="Render mode">
                          {RENDER_MODES.map(m => (
                            <button
                              key={m.value}
                              type="button"
                              className={`voxel-mode-toggle__btn${voxelRenderMode === m.value ? ' is-on' : ''}`}
                              onClick={() => setVoxelRenderMode(m.value)}
                              aria-pressed={voxelRenderMode === m.value}
                              title={m.label}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="unified-layer-accordion"
                        onClick={() => setVoxelDatumOpenId(prev => prev === vlayer.id ? null : vlayer.id)}
                        aria-expanded={datumOpen}
                      >
                        <span>{datumOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Datum</span>
                      </button>
                      {datumOpen && (
                        <div className="unified-layer-prop col">
                          <span style={{ fontSize: 11, color: 'var(--dw-text-3)' }}>
                            lon {vlayer.datum.lon.toFixed(6)} ·
                            lat {vlayer.datum.lat.toFixed(6)} ·
                            alt {Math.round(vlayer.datum.alt)} m
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        className="unified-layer-accordion"
                        onClick={() => setVoxelGenOpenId(prev => prev === vlayer.id ? null : vlayer.id)}
                        aria-expanded={genOpen}
                      >
                        <span>
                          {genOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          {' '}Generators
                          <span style={{ marginLeft: 6, color: 'var(--dw-text-3)' }}>
                            ({vlayer.generators.length})
                          </span>
                        </span>
                      </button>
                      {genOpen && (
                        <div className="unified-layer-prop col">
                          {vlayer.generators.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--dw-text-3)' }}>
                              No generators yet. Use a voxel tool to add one.
                            </span>
                          ) : (
                            <ul className="unified-layer-gens">
                              {vlayer.generators.map((g, i) => (
                                <li key={i}>{g.type ?? `generator ${i + 1}`}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add Layer — single button + inline type picker */}
          <div className="unified-layer-add-wrap">
            {!addPickerOpen ? (
              <button
                type="button"
                className="sketch-layers-btn"
                onClick={() => setAddPickerOpen(true)}
                style={{ marginTop: 8 }}
              >
                <Plus size={14} /> <span>Add layer</span>
              </button>
            ) : (
              <div className="unified-layer-add-picker">
                <button
                  type="button"
                  className="unified-layer-add-picker__option"
                  onClick={() => {
                    addLayer(activeSketch.id)
                    setAddPickerOpen(false)
                  }}
                >
                  <Pencil size={14} />
                  <span className="unified-layer-add-picker__title">Drawing layer</span>
                  <span className="unified-layer-add-picker__sub">Vector strokes, shapes, redline</span>
                </button>
                <button
                  type="button"
                  className="unified-layer-add-picker__option"
                  onClick={() => {
                    createVoxelLayer()
                    setAddPickerOpen(false)
                  }}
                >
                  <Box size={14} />
                  <span className="unified-layer-add-picker__title">Voxel layer</span>
                  <span className="unified-layer-add-picker__sub">3D block grid, terrain mask, water</span>
                </button>
                <button
                  type="button"
                  className="unified-layer-add-picker__cancel"
                  onClick={() => setAddPickerOpen(false)}
                  aria-label="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {redlineModalOpen && siteSlug && (
        <RedlineCreationModal
          siteSlug={siteSlug}
          onClose={() => setRedlineModalOpen(false)}
        />
      )}

      {schemaEditorLayerId && (
        <SchemaEditorModal
          initialScope="layer"
          layerId={schemaEditorLayerId}
          onClose={() => setSchemaEditorLayerId(null)}
        />
      )}
    </div>
  )
}
