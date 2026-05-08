import { useEffect } from 'react'
import { BASEMAPS } from './constants'

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const panel = (
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

  if (isMobile) {
    return (
      <div className="basemap-scrim" onClick={onClose} role="presentation">
        <div onClick={(e) => e.stopPropagation()}>{panel}</div>
      </div>
    )
  }
  return panel
}
