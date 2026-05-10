import { Map as MapIcon } from 'lucide-react'
import { BASEMAPS } from './constants'
import { MiniPlayer } from '../../components/MiniPlayer'

interface BasemapWidgetProps {
  activeBasemap: string
  switchBasemap: (id: string) => void
  onClose: () => void
  isMobile?: boolean
}

export default function BasemapWidget({
  activeBasemap,
  switchBasemap,
  onClose,
  isMobile = false,
}: BasemapWidgetProps) {
  // ESC handling lives in CesiumViewer's `closeActivePanel`, which closes
  // every open panel (including this one) in priority order.

  const activeMeta = BASEMAPS.find((b) => b.id === activeBasemap)

  // Mobile: ribbon at the bottom so the user keeps the map visible
  // while picking a style. Tap a tile to switch — the ribbon stays
  // open until the user taps the chevron / swipes it down. Single-tap
  // also auto-collapses since the choice is decisive.
  if (isMobile) {
    return (
      <MiniPlayer
        placement="bottom"
        icon={<MapIcon size={14} />}
        title="Map style"
        subtitle={activeMeta?.label}
        defaultOpen
        maxExpandedHeight={280}
        onClose={onClose}
        expanded={
          <div className="basemap-panel-body">
            {BASEMAPS.map(bm => (
              <button
                key={bm.id}
                className={`basemap-option${activeBasemap === bm.id ? ' active' : ''}`}
                onClick={() => switchBasemap(bm.id)}
                type="button"
              >
                <span className="basemap-icon">{bm.icon}</span>
                <span className="basemap-label">{bm.label}</span>
              </button>
            ))}
          </div>
        }
      />
    )
  }

  // Desktop: original floating panel.
  return (
    <div className="basemap-panel" role="dialog" aria-label="Map Style">
      <div className="basemap-panel-header">
        <span className="basemap-panel-title">Map Style</span>
        <button
          className="basemap-panel-close"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ×
        </button>
      </div>
      <div className="basemap-panel-body">
        {BASEMAPS.map(bm => (
          <button
            key={bm.id}
            className={`basemap-option${activeBasemap === bm.id ? ' active' : ''}`}
            onClick={() => switchBasemap(bm.id)}
            type="button"
          >
            <span className="basemap-icon">{bm.icon}</span>
            <span className="basemap-label">{bm.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
