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
  pointSymbol?: import('../../shared/pointSymbology').PointSymbolStyle
}

export interface BoxDraft {
  lon: number
  lat: number
  alt: number
  width: number
  height: number
  depth: number
  heading: number
  wallThickness: number
  shape: 'square'
}

export interface PitDraft {
  lon: number
  lat: number
  alt: number
  width: number
  depth: number
  height: number
  heading: number
  wallThickness: number
  floorThickness: number
  shape: 'square' | 'round'
  radius: number
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

export const RAIL_TABS: { id: DesignRailTab; label: string; icon: string }[] = [
  { id: 'layers', label: 'Layers', icon: '◫' },
  { id: 'sketch', label: 'Sketch', icon: '✎' },
  { id: 'edit', label: 'Edit', icon: '⊞' },
  { id: 'style', label: 'Style', icon: '◐' },
  { id: 'history', label: 'History', icon: '☰' },
  { id: 'submit', label: 'Submit', icon: '↗' },
  { id: 'download', label: 'Export', icon: '↓' },
]
