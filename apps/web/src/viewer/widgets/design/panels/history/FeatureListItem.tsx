/** Single feature row inside a layer- or type-group. Click to select,
 *  hover to reveal the delete button. */
import { Trash2 } from 'lucide-react'
import type { SketchFeature } from '../../types'
import { GEOM_ICONS } from './groupings'

interface Props {
  feature: SketchFeature
  selected: boolean
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}

export default function FeatureListItem({ feature, selected, onSelect, onDelete }: Props) {
  return (
    <li
      className={`design-feature-item${selected ? ' selected' : ''}`}
      onClick={() => onSelect(selected ? null : feature.id)}
    >
      <span className="design-feature-icon">
        {GEOM_ICONS[feature.geometry] ?? GEOM_ICONS.other}
      </span>
      <span className="design-feature-label">{feature.label}</span>
      <span className="design-feature-geom">{feature.geometry}</span>
      <button
        className="design-feature-delete"
        title="Delete feature"
        onClick={e => { e.stopPropagation(); onDelete(feature.id) }}
      >
        <Trash2 size={13} />
      </button>
    </li>
  )
}
