/**
 * MightyTwin — Download Panel
 *
 * Pure rendering. State + side-effects in `download/useDownload.ts`; format
 * catalogue in `download/formats.ts`. All listed formats round-trip through
 * the v2 backend (`/api/design/export`).
 */
import { Download, Loader, AlertCircle } from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { useDownload } from './download/useDownload'
import { EXPORT_FORMATS, type ExportFormat } from './download/formats'
import type { SplitMode } from './download/split'

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

export default function DownloadPanel({ viewer, layers, features }: Props) {
  const dl = useDownload({ viewer, layers, features })

  const groupOrder = Array.from(new Set(EXPORT_FORMATS.map(f => f.group)))

  return (
    <div className="dl-panel">
      <SummaryBanner
        featureCount={dl.summary.featureCount}
        visibleLayers={dl.summary.visibleLayers.length}
        totalLayers={dl.summary.totalLayers}
      />

      <div className="dl-section-label">Export Geometry</div>

      <div className="dl-row">
        <select
          className="dl-select"
          value={dl.format}
          onChange={e => dl.setFormat(e.target.value as ExportFormat)}
          title="Format"
        >
          {groupOrder.map(group => (
            <optgroup key={group} label={group}>
              {EXPORT_FORMATS.filter(f => f.group === group).map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          className="dl-select"
          value={dl.crs}
          onChange={e => dl.setCrs(Number(e.target.value))}
          title="CRS"
          disabled={dl.format === 'json_state'}
        >
          {dl.crsOptions.map(o => (
            <option key={o.epsg} value={o.epsg}>{o.name}</option>
          ))}
        </select>
      </div>

      <div className="dl-row">
        <select
          className="dl-select"
          value={dl.sketchScope}
          onChange={e => dl.setSketchScope(e.target.value)}
          title="Scope"
          disabled={dl.format === 'json_state'}
        >
          <option value="__all__">All visible</option>
          {layers.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className="dl-select"
          value={dl.splitMode}
          onChange={e => dl.setSplitMode(e.target.value as SplitMode)}
          title="Split mode"
          disabled={dl.format === 'json_state'}
        >
          <option value="none">No split</option>
          <option value="layer">By layer</option>
          <option value="attribute">By attribute</option>
        </select>
      </div>

      {dl.splitMode === 'attribute' && (
        <input
          className="dl-input"
          type="text"
          placeholder="Attribute name to split on"
          value={dl.splitAttr}
          onChange={e => dl.setSplitAttr(e.target.value)}
        />
      )}

      {dl.error && <ErrorBanner message={dl.error} />}

      <button
        className="dl-export-btn"
        onClick={dl.download}
        disabled={dl.downloading || dl.summary.featureCount === 0}
      >
        {dl.downloading
          ? <><Loader size={14} className="spin" /> Exporting…</>
          : <><Download size={14} /> Export</>}
      </button>
    </div>
  )
}

function SummaryBanner({ featureCount, visibleLayers, totalLayers }: { featureCount: number; visibleLayers: number; totalLayers: number }) {
  return (
    <div className="dl-summary">
      <Download size={18} className="dl-summary-icon" />
      <div>
        <div className="dl-summary-count">
          {featureCount} feature{featureCount === 1 ? '' : 's'} ready
        </div>
        <div className="dl-summary-meta">
          From {visibleLayers} visible / {totalLayers} total layer{totalLayers === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="dl-error">
      <AlertCircle size={14} />
      <span>{message}</span>
    </div>
  )
}
