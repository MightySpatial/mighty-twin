import { BASEMAPS } from './constants'

interface BasemapWidgetProps {
  activeBasemap: string
  switchBasemap: (id: string) => void
}

export default function BasemapWidget({ activeBasemap, switchBasemap }: BasemapWidgetProps) {
  return (
    <div className="basemap-picker">
      {BASEMAPS.map(bm => (
        <button
          key={bm.id}
          className={`basemap-option${activeBasemap === bm.id ? ' active' : ''}`}
          onClick={() => switchBasemap(bm.id)}
        >
          <span className="basemap-icon">{bm.icon}</span>
          <span className="basemap-label">{bm.label}</span>
        </button>
      ))}
    </div>
  )
}
