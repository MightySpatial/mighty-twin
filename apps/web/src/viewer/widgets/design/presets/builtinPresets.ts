/**
 * MightyTwin — Built-in Layer Presets
 * Ported from V1 DesignWidget.vue LAYER_PRESETS.
 * Each preset defines a set of sketch layers with names and colours.
 */

export interface PresetLayerDef {
  name: string
  colour: string
  coordMode?: 'world' | 'local'
}

export interface LayerPreset {
  id: string
  name: string
  layers: PresetLayerDef[]
}

export const BUILTIN_PRESETS: LayerPreset[] = [
  {
    id: 'blank',
    name: 'Blank',
    layers: [
      { name: 'Default', colour: '#94a3b8' },
    ],
  },
  {
    id: 'survey',
    name: 'Survey & Site',
    layers: [
      { name: 'Survey Control', colour: '#f59e0b' },
      { name: 'Site Boundary', colour: '#ef4444' },
      { name: 'Topography', colour: '#84cc16' },
      { name: 'Annotations', colour: '#94a3b8' },
    ],
  },
  {
    id: 'utilities',
    name: 'Existing Utilities',
    layers: [
      { name: 'Water', colour: '#3b82f6' },
      { name: 'Sewer', colour: '#a855f7' },
      { name: 'Stormwater', colour: '#06b6d4' },
      { name: 'Gas', colour: '#f97316' },
      { name: 'Electrical', colour: '#eab308' },
      { name: 'Communications', colour: '#ec4899' },
    ],
  },
  {
    id: 'proposed',
    name: 'Proposed vs Existing',
    layers: [
      { name: 'Existing (keep)', colour: '#6b7280' },
      { name: 'Existing (demolish)', colour: '#ef4444' },
      { name: 'Proposed', colour: '#22c55e' },
      { name: 'Future', colour: '#a78bfa' },
    ],
  },
  {
    id: 'civil',
    name: 'Civil',
    layers: [
      { name: 'Earthworks', colour: '#92400e' },
      { name: 'Road Geometry', colour: '#374151' },
      { name: 'Drainage', colour: '#06b6d4' },
      { name: 'Structures', colour: '#6b7280' },
      { name: 'Services', colour: '#f97316' },
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture',
    layers: [
      { name: 'Site', colour: '#84cc16' },
      { name: 'Structure', colour: '#374151' },
      { name: 'Services', colour: '#f97316' },
      { name: 'Finishes', colour: '#f9a8d4' },
      { name: 'Annotations', colour: '#94a3b8' },
    ],
  },
  {
    id: 'building',
    name: 'Building Design',
    layers: [
      { name: 'Site Context', colour: '#84cc16', coordMode: 'world' },
      { name: 'Ground Floor', colour: '#6366f1', coordMode: 'local' },
      { name: 'First Floor', colour: '#8b5cf6', coordMode: 'local' },
      { name: 'Roof', colour: '#ef4444', coordMode: 'local' },
      { name: 'Services', colour: '#f97316', coordMode: 'local' },
    ],
  },
  {
    id: 'ifc',
    name: 'IFC Classes',
    layers: [
      { name: 'IfcWall', colour: '#78716c' },
      { name: 'IfcSlab', colour: '#a8a29e' },
      { name: 'IfcColumn', colour: '#57534e' },
      { name: 'IfcBeam', colour: '#44403c' },
      { name: 'IfcDoor', colour: '#854d0e' },
      { name: 'IfcWindow', colour: '#0ea5e9' },
      { name: 'IfcStair', colour: '#d97706' },
      { name: 'IfcRoof', colour: '#dc2626' },
      { name: 'IfcRailing', colour: '#65a30d' },
      { name: 'IfcCurtainWall', colour: '#06b6d4' },
      { name: 'IfcPlate', colour: '#6366f1' },
      { name: 'IfcMember', colour: '#8b5cf6' },
      { name: 'IfcFooting', colour: '#1c1917' },
      { name: 'IfcPile', colour: '#292524' },
      { name: 'IfcBuildingElementProxy', colour: '#a1a1aa' },
      { name: 'IfcFurnishingElement', colour: '#f472b6' },
      { name: 'IfcFlowTerminal', colour: '#22c55e' },
      { name: 'IfcFlowSegment', colour: '#14b8a6' },
      { name: 'IfcDistributionElement', colour: '#f59e0b' },
      { name: 'IfcSpace', colour: '#e879f9' },
    ],
  },
]
