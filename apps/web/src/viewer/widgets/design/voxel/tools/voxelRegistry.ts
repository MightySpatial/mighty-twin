/**
 * VoxelToolRegistry — voxel-side analogue of the sketch ToolRegistry.
 *
 * Mirrors the spec/shape of `sketch/tools/registry.ts` (id, label, icon,
 * Parameters component) but separates the registry table so the voxel
 * tools live entirely on the voxel engine and don't pollute the CAD
 * draft-node lifecycle.
 *
 * Voxel tools differ in two important ways:
 *   • Active state lives on `useSvoEngine`, not `useCadEngine`.
 *   • There's no draft node — most tools stamp blocks immediately on
 *     pick (paint/erase/eyedrop) or via a parameter form (box/dome/
 *     pyramid). Tools that need globe input either:
 *       — borrow the CAD polygon tool (terrain_mask, prism), or
 *       — use a one-shot click handler the toolbox installs (water).
 *
 * Icons are SVG path strings ("path data" for the `d` attribute on a
 * <path> element). The toolbox renders them inside a 16×16 viewBox.
 */
import type { ComponentType, ReactNode } from 'react'
import { lazy, type LazyExoticComponent } from 'react'

export type VoxelToolGroup = 'voxel'

export interface VoxelToolParametersProps {
  /** Render a hint banner above tool params; the toolbox supplies one
   *  describing the pick flow ("click on globe", "draw polygon", …). */
  hint?: ReactNode
}

export interface VoxelToolSpec {
  /** Stable id used by useSvoEngine.activeToolId + UI lookups. */
  id: string
  label: string
  /** SVG path data for the 16×16 icon. */
  icon: string
  group: VoxelToolGroup
  /** Short tagline shown beneath the tool name in the toolbox. */
  hint: string
  /** Lazy-loaded Parameters component (null = no params; tool acts on
   *  click only, e.g. eyedropper). */
  parameters: LazyExoticComponent<ComponentType<VoxelToolParametersProps>> | null
  /** Pick flow this tool needs: 'click' = single globe click,
   *  'drag'  = paint stroke (multiple cells per drag),
   *  'polygon' = borrows the CAD polygon tool,
   *  'form'  = no globe interaction; commit fires from the params form. */
  pickFlow: 'click' | 'drag' | 'polygon' | 'form'
}

// ── Lazy parameter components ──────────────────────────────────────────
//
// One file per Parameters component, kept side-by-side under
// ./parameters/. The voxel forms are simpler than CAD — most are 3-5
// number rows + a material picker.

const BoxFillParameters       = lazy(() => import('./parameters/BoxFillParameters'))
const PyramidParameters       = lazy(() => import('./parameters/PyramidParameters'))
const PrismParameters         = lazy(() => import('./parameters/PrismParameters'))
const WedgeParameters         = lazy(() => import('./parameters/WedgeParameters'))
const DomeParameters          = lazy(() => import('./parameters/DomeParameters'))
const WaterFillParameters     = lazy(() => import('./parameters/WaterFillParameters'))
const TerrainMaskParameters   = lazy(() => import('./parameters/TerrainMaskParameters'))
const PaintEraseParameters    = lazy(() => import('./parameters/PaintEraseParameters'))

// ── Icon path data (16×16 viewBox) ─────────────────────────────────────
//
// Kept terse. The toolbox wraps these in a <svg viewBox="0 0 16 16">.

const ICON = {
  paint:        'M3 12l5-5 3 3-5 5H3v-3zm6-6l3-3 3 3-3 3-3-3z',
  erase:        'M3 12l4-4 6 6-2 2H4v-2l-1-2zm9-9l3 3-5 5-3-3 5-5z',
  eyedrop:      'M11 2l3 3-7 7-3 1 1-3 6-6-1-1 1-1zm-7 11l1-1 1 1-1 1H4v-1z',
  box:          'M3 4l5-2 5 2v8l-5 2-5-2V4zm5 0l5 2-5 2-5-2 5-2z',
  pyramid:      'M8 2L3 14h10L8 2zm0 3l3 7H5l3-7z',
  prism:        'M3 4l5-2 5 2-2 8H5L3 4zm2 1l3-1 3 1-1 6H6L5 5z',
  wedge:        'M3 13L13 3v10H3z',
  dome:         'M3 12a5 5 0 0110 0H3zm5-7a4 4 0 014 4v3H4V9a4 4 0 014-4z',
  water:        'M8 2c-3 4-5 6-5 9a5 5 0 0010 0c0-3-2-5-5-9zm0 12a3 3 0 003-3H5a3 3 0 003 3z',
  terrainMask:  'M2 12l3-5 3 3 3-4 3 6H2zm0 2h12v1H2v-1z',
} as const

// ── Registry table ─────────────────────────────────────────────────────

export const VOXEL_TOOL_REGISTRY: Record<string, VoxelToolSpec> = {
  voxel_paint: {
    id: 'voxel_paint',
    label: 'Block Paint',
    icon: ICON.paint,
    group: 'voxel',
    hint: 'Click or drag to stamp blocks of the active material at the current level.',
    parameters: PaintEraseParameters,
    pickFlow: 'drag',
  },
  voxel_erase: {
    id: 'voxel_erase',
    label: 'Block Erase',
    icon: ICON.erase,
    group: 'voxel',
    hint: 'Click or drag to remove blocks at the current level.',
    parameters: PaintEraseParameters,
    pickFlow: 'drag',
  },
  voxel_eyedrop: {
    id: 'voxel_eyedrop',
    label: 'Eyedropper',
    icon: ICON.eyedrop,
    group: 'voxel',
    hint: 'Click a block on the globe to copy its material.',
    parameters: null,
    pickFlow: 'click',
  },
  voxel_box: {
    id: 'voxel_box',
    label: 'Box Fill',
    icon: ICON.box,
    group: 'voxel',
    hint: 'Stamp a W×D×H box of the active material. Optionally fill down to terrain.',
    parameters: BoxFillParameters,
    pickFlow: 'form',
  },
  voxel_pyramid: {
    id: 'voxel_pyramid',
    label: 'Pyramid',
    icon: ICON.pyramid,
    group: 'voxel',
    hint: 'Stepped block pyramid — base W×D, height, per-face wall angle.',
    parameters: PyramidParameters,
    pickFlow: 'form',
  },
  voxel_prism: {
    id: 'voxel_prism',
    label: 'Prism',
    icon: ICON.prism,
    group: 'voxel',
    hint: 'Draw a polygon footprint on the globe → set height → fills columns.',
    parameters: PrismParameters,
    pickFlow: 'polygon',
  },
  voxel_wedge: {
    id: 'voxel_wedge',
    label: 'Wedge / Ramp',
    icon: ICON.wedge,
    group: 'voxel',
    hint: 'Sloped wedge — base W×D, height, slope angle, slope direction.',
    parameters: WedgeParameters,
    pickFlow: 'form',
  },
  voxel_dome: {
    id: 'voxel_dome',
    label: 'Dome',
    icon: ICON.dome,
    group: 'voxel',
    hint: 'Ellipsoidal dome — set radius along W/D/H axes.',
    parameters: DomeParameters,
    pickFlow: 'form',
  },
  voxel_water: {
    id: 'voxel_water',
    label: 'Water Fill',
    icon: ICON.water,
    group: 'voxel',
    hint: 'Click a datum point, set fill elevation. Floods connected air with water.',
    parameters: WaterFillParameters,
    pickFlow: 'click',
  },
  voxel_terrain_mask: {
    id: 'voxel_terrain_mask',
    label: 'Terrain Mask',
    icon: ICON.terrainMask,
    group: 'voxel',
    hint: 'Draw polygon, choose scope. Samples Cesium terrain → fills columns to depth.',
    parameters: TerrainMaskParameters,
    pickFlow: 'polygon',
  },
}

/** Display order in the toolbox grid. */
export const VOXEL_TOOL_ORDER: string[] = [
  'voxel_paint', 'voxel_erase', 'voxel_eyedrop',
  'voxel_box', 'voxel_pyramid', 'voxel_prism',
  'voxel_wedge', 'voxel_dome', 'voxel_water',
  'voxel_terrain_mask',
]

export function lookupVoxelTool(id: string | null): VoxelToolSpec | null {
  if (!id) return null
  return VOXEL_TOOL_REGISTRY[id] ?? null
}
