/**
 * MightyTwin — Design Extension
 * Registers the Design widget panel with the extension system.
 */
import { registerExtension } from '../types'
import type { PanelProps } from '../types'
import { DesignWidget } from '../../widgets/design'

function DesignPanel({ viewer, context, onClose }: PanelProps) {
  return (
    <DesignWidget viewer={viewer} onClose={onClose} siteSlug={context.siteId || null} />
  )
}

registerExtension({
  id: 'design',
  name: 'Design',
  version: '2.0.0',

  panel: {
    icon: <span style={{ fontSize: 14, fontWeight: 700 }}>⬡</span>,
    label: 'Design',
    component: DesignPanel,
  },
})
