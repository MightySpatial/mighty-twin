/**
 * MightyTwin — Download Panel
 *
 * Pure rendering. State + side-effects live in `download/useDownload.ts`;
 * format catalogue in `download/formats.ts`; CSV/WKT/split helpers in their
 * own files. Faithful port of v1's Format / CRS / Scope / Split layout.
 */
import { Download, Loader, AlertCircle } from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { useDownload } from './download/useDownload'
import { EXPORT_FORMATS, EXPORT_CRS_OPTIONS, type ExportFormat } from './download/formats'
import type { SplitMode } from './download/split'

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

export default function DownloadPanel({ viewer, layers, features }: Props) {
  const dl = useDownload({ viewer, layers, features })

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
          {Array.from(new Set(EXPORT_FORMATS.map(f => f.group))).map(group => (
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
          {EXPORT_CRS_OPTIONS.map(o => (
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

      {dl.isBackendBlocked && (
        <BlockedFormatNotice formatLabel={dl.formatSpec.label} />
      )}

      {dl.error && <ErrorBanner message={dl.error} />}

      <button
        className="dl-export-btn"
        onClick={dl.download}
        disabled={dl.downloading || dl.summary.featureCount === 0 || dl.isBackendBlocked}
      >
        {dl.downloading
          ? <><Loader size={12} className="spin" /> Exporting…</>
          : <>↓ Export</>}
      </button>
    </div>
  )
}

function SummaryBanner({ featureCount, visibleLayers, totalLayers }: { featureCount: number; visibleLayers: number; totalLayers: number }) {
  return (
    <div className="dl-summary">
      <Download size={16} className="dl-summary-icon" />
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

function BlockedFormatNotice({ formatLabel }: { formatLabel: string }) {
  return (
    <div className="dl-warning">
      <AlertCircle size={12} />
      <span>{formatLabel} export needs the server-side export service (not yet wired up in v2).</span>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="dl-error">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  )
}
