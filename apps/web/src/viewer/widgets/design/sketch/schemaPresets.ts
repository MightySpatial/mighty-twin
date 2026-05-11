/**
 * Built-in schema presets — drop-in `fields[]` arrays the user can
 * apply to a blank sketch via the "Apply schema preset" dropdown in
 * the LayersTab.
 *
 * Mirrors v1's MightyDT presets. Keep this list short and opinionated;
 * we're not trying to be exhaustive, just to give the user a sensible
 * starting schema for common workflows (utility surveys, redlines,
 * IFC export, etc.).
 *
 * Spec V1_SPEC.md §8.
 */
import type { SchemaField } from './types'

/** Pretty label rendered in the dropdown. */
export interface SchemaPreset {
  id: SchemaPresetId
  label: string
  description: string
  fields: SchemaField[]
}

export type SchemaPresetId =
  | 'blank'
  | 'survey_site'
  | 'existing_utilities'
  | 'proposed_vs_existing'
  | 'civil'
  | 'architecture'
  | 'building_design'
  | 'ifc_classes'

/** Compact builders so each preset reads as a list rather than a wall
 *  of object literals. */
const t = (key: string): SchemaField => ({ key, type: 'text' })
const n = (key: string): SchemaField => ({ key, type: 'number' })
const d = (key: string): SchemaField => ({ key, type: 'date' })
const s = (key: string, options: string[]): SchemaField => ({ key, type: 'select', options })
/** Boolean is modelled as a 2-option select — the SchemaField type
 *  union doesn't carry a native boolean today and the schema editor
 *  already knows how to render select fields. */
const b = (key: string): SchemaField => ({ key, type: 'select', options: ['true', 'false'] })

export const SCHEMA_PRESETS: Record<SchemaPresetId, SchemaPreset> = {
  blank: {
    id: 'blank',
    label: 'Blank',
    description: 'No fields — start from scratch.',
    fields: [],
  },
  survey_site: {
    id: 'survey_site',
    label: 'Survey site',
    description: 'Field survey snapshot with QA metadata.',
    fields: [
      t('id'),
      t('name'),
      t('description'),
      d('survey_date'),
      t('surveyor'),
      n('accuracy_m'),
      s('status', ['draft', 'approved', 'superseded']),
    ],
  },
  existing_utilities: {
    id: 'existing_utilities',
    label: 'Existing utilities',
    description: 'Buried services capture — wet + dry.',
    fields: [
      t('id'),
      t('name'),
      s('service_type', ['water', 'sewer', 'gas', 'electric', 'telecoms', 'stormwater']),
      t('material'),
      n('diameter_mm'),
      n('depth_m'),
      t('owner'),
      n('install_year'),
      s('condition', ['good', 'fair', 'poor', 'unknown']),
    ],
  },
  proposed_vs_existing: {
    id: 'proposed_vs_existing',
    label: 'Proposed vs existing',
    description: 'Stage redlines — existing / proposed / demolished.',
    fields: [
      t('id'),
      t('name'),
      s('status', ['existing', 'proposed', 'demolished', 'retained']),
      t('discipline'),
      t('drawing_ref'),
      t('revision'),
    ],
  },
  civil: {
    id: 'civil',
    label: 'Civil',
    description: 'Earthworks, pavement, drainage, structures.',
    fields: [
      t('id'),
      t('name'),
      s('type', ['earthworks', 'pavement', 'drainage', 'structure', 'retaining']),
      t('material'),
      n('level_m'),
      n('chainage_m'),
      t('drawing_ref'),
    ],
  },
  architecture: {
    id: 'architecture',
    label: 'Architecture',
    description: 'Spaces — rooms, corridors, plant.',
    fields: [
      t('id'),
      t('name'),
      s('space_type', ['room', 'corridor', 'lobby', 'plant', 'external']),
      t('floor_level'),
      n('area_m2'),
      t('ifc_class'),
      t('description'),
    ],
  },
  building_design: {
    id: 'building_design',
    label: 'Building design',
    description: 'Building elements — walls / floors / roofs.',
    fields: [
      t('id'),
      t('name'),
      s('element_type', ['wall', 'floor', 'roof', 'column', 'beam', 'opening']),
      t('material'),
      t('fire_rating'),
      b('structural'),
      t('ifc_class'),
    ],
  },
  ifc_classes: {
    id: 'ifc_classes',
    label: 'IFC classes',
    description: 'Tag each feature with an IFC class for export.',
    fields: [
      t('id'),
      t('name'),
      s('ifc_class', [
        'IfcWall', 'IfcSlab', 'IfcBeam', 'IfcColumn',
        'IfcDoor', 'IfcWindow', 'IfcSpace', 'IfcSite',
        'IfcBuilding', 'IfcBuildingStorey', 'IfcGeographicElement',
      ]),
      t('description'),
      t('object_type'),
    ],
  },
}

/** Ordered list — controls dropdown order. */
export const SCHEMA_PRESET_ORDER: SchemaPresetId[] = [
  'blank',
  'survey_site',
  'existing_utilities',
  'proposed_vs_existing',
  'civil',
  'architecture',
  'building_design',
  'ifc_classes',
]
