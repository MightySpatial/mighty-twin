/**
 * MightyTwin — Design Widget Types
 * Core type definitions for the sketch/design system.
 */

export type SolidTool = 'box' | 'pit' | 'cylinder'

/** Phase-I primitives ported from DT v1. Parameter panels in
 *  apps/web/src/viewer/widgets/design/tools/parameters/ accept user
 *  input but full geometry generation is staged — each gets fully
 *  active as it's exercised in user testing. */
export type DesignPrimitive =
  | 'curve'
  | 'sphere'
  | 'ellipse'
  | 'polygonN'
  | 'loft'
  | 'pipe'
  | 'cone'
  | 'extrude'

export type DesignTool =
  | 'select'
  | 'point'
  | 'line'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'traverse'
  | SolidTool
  | DesignPrimitive
  | null

export type ElevationMode = 'terrain' | 'none' | 'entry'

export type ElevationDatum = 'ellipsoid' | 'mga2020' | 'terrain' | 'custom_terrain'

export interface ElevationConfig {
  datum: ElevationDatum
  offset: number  // metres, positive or negative, 3 decimal precision
}

export const DEFAULT_ELEVATION_CONFIG: ElevationConfig = {
  datum: 'terrain',
  offset: 0,
}

export type DesignRailTab = 'layers' | 'sketch' | 'edit' | 'style' | 'history' | 'submit' | 'download'

export interface AttributeField {
  id: number
  key: string
  type: 'text' | 'number' | 'date' | 'select'
  defaultVal: string
  auto?: boolean
}

export interface SketchLayer {
  id: string
  name: string
  colour: string
  visible: boolean
  locked: boolean
  order: number
  collapsed?: boolean
  coordMode: 'world' | 'local'
  fields: AttributeField[]
}

export interface FeatureStyle {
  strokeColor: string
  fillColor: string
  lineWidth: number
  opacity: number
  /** Optional point symbology — v2 enhancement; coexists with v1 pointSize/pointShape. */
  pointSymbol?: import('../../shared/pointSymbology').PointSymbolStyle
  /** v1: separate fill opacity for polygons (defaults to opacity). */
  fillOpacity?: number
  /** v1: dashed/dotted line patterns. */
  lineDash?: 'solid' | 'dash' | 'dot' | 'dashdot'
  /** v1: outline colour for polygons + points (separate from stroke). */
  outlineColor?: string
  /** v1: outline width for polygons + points. */
  outlineWidth?: number
  /** v1: point size in px (4–32). */
  pointSize?: number
  /** v1: point shape (circle/square/diamond/triangle/cross). */
  pointShape?: 'circle' | 'square' | 'diamond' | 'triangle' | 'cross'
  /** v1: attribute key whose value is rendered as a map label. */
  labelField?: string | null
  /** v1: label font size (8–24). */
  labelSize?: number
}

export interface BoxDraft {
  lon: number
  lat: number
  alt: number
  width: number
  height: number
  depth: number
  heading: number
  pitch: number
  roll: number
  wallThickness: number
  shape: 'square'
  /** Vertical anchor reference: 'bot' (sits on terrain), 'center', 'top'. */
  refZ?: 'bot' | 'center' | 'top'
}

export interface PitDraft {
  lon: number
  lat: number
  alt: number
  width: number
  depth: number
  height: number
  heading: number
  pitch: number
  roll: number
  wallThickness: number
  floorThickness: number
  shape: 'square' | 'round'
  radius: number
  /** Vertical anchor reference: 'top' (extends below terrain), 'center', 'bot'. */
  refZ?: 'top' | 'center' | 'bot'
}

export interface CylDraft {
  lon: number
  lat: number
  alt: number
  radius: number
  height: number
  heading: number
  pitch: number
  roll: number
  wallThickness: number
}

export type SolidDraft = BoxDraft | PitDraft | CylDraft

export interface TraverseLeg {
  bearing: number   // degrees from north, clockwise
  distance: number  // in selected unit
  unit: 'm' | 'ft'
}

export interface TraverseDraft {
  startLon: number  // degrees
  startLat: number  // degrees
  legs: TraverseLeg[]
}

export interface SketchFeature {
  id: string
  label: string
  geometry: 'point' | 'line' | 'polygon' | 'rectangle' | 'circle' | 'traverse' | 'box' | 'pit' | 'cylinder' | 'other'
  layerId: string
  entityId: string
  style: FeatureStyle
  elevationConfig: ElevationConfig
  attributes: Record<string, unknown>
  solidParams?: Record<string, unknown>
  createdAt: number
}

export const DEFAULT_FEATURE_STYLE: FeatureStyle = {
  strokeColor: '#22D3EE',
  fillColor: '#22D3EE',
  lineWidth: 3,
  opacity: 0.7,
}

/** Compact glyphs for the horizontal rail. Single-character mono icons keep
 *  the rail tight; v1 used inline SVG, but the engineering-instrument vibe
 *  reads cleanly from these mono glyphs in the JetBrains Mono stack. */
export const RAIL_TABS: { id: DesignRailTab; label: string; icon: string }[] = [
  { id: 'layers',   label: 'Layers',   icon: '▤' },
  { id: 'sketch',   label: 'Sketch',   icon: '✎' },
  { id: 'edit',     label: 'Edit',     icon: '⌖' },
  { id: 'style',    label: 'Style',    icon: '◐' },
  { id: 'history',  label: 'History',  icon: '☰' },
  { id: 'submit',   label: 'Submit',   icon: '↗' },
  { id: 'download', label: 'Export',   icon: '↓' },
]
