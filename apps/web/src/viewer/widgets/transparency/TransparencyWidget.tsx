interface TransparencyWidgetProps {
  globeAlpha: number
  setGlobeAlpha: (v: number) => void
  onClose: () => void
}

export default function TransparencyWidget({ globeAlpha, setGlobeAlpha, onClose }: TransparencyWidgetProps) {
  return (
    <div className="transparency-panel">
      <div className="transparency-panel-header">
        <span>Globe Transparency</span>
        <button className="ext-panel-close" onClick={onClose}>×</button>
      </div>
      <div className="transparency-panel-body">
        <div className="ext-slider-row">
          <input
            type="range"
            className="ext-slider"
            min={0}
            max={100}
            value={globeAlpha}
            onChange={e => setGlobeAlpha(Number(e.target.value))}
          />
          <span className="ext-slider-val">{globeAlpha}%</span>
        </div>
        {globeAlpha < 100 && (
          <p className="ext-hint">Underground false floor at –200 m. Camera collision disabled.</p>
        )}
      </div>
    </div>
  )
}
