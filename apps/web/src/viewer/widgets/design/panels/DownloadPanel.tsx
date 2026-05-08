/** Design Download panel — T+1310.
 *
 *  Replaces the V1 "Available in Sprint 2" placeholder. Exports the
 *  current sketch state as either:
 *
 *    - GeoJSON FeatureCollection (one collection per visible layer,
 *      bundled into a single FeatureCollection with _layer_id on
 *      each feature's properties for round-trip)
 *    - GeoJSON per-layer (one file per visible layer in a zip)
 *    - Plain JSON (full SketchLayer + SketchFeature dump for round-
 *      trip into another Twin via Sketch persistence)
 *
 *  Reuses serializeSketchLayers from T+420 — the same function that
 *  builds the submission payload — so Download and Submit see the
 *  exact same bytes.
 */

import { useMemo, useState } from 'react'
import { Download, Loader, Map as MapIcon, Code, X } from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { serializeSketchLayers } from '../serializeFeatures'

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

type Format = 'geojson_combined' | 'geojson_per_layer' | 'json_state'

export default function DownloadPanel({ viewer, layers, features }: Props) {
  const [format, setFormat] = useState<Format>('geojson_combined')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const visibleLayers = layers.filter((l) => l.visible)
    const visibleFeatureIds = new Set<string>()
    for (const f of features) {
      const layer = visibleLayers.find((l) => l.id === f.layerId)
      if (layer) visibleFeatureIds.add(f.id)
    }
    return {
      visibleLayers,
      featureCount: visibleFeatureIds.size,
      totalLayers: layers.length,
      totalFeatures: features.length,
    }
  }, [layers, features])

  function trigger(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      if (format === 'geojson_combined') {
        const { features: gjFeatures, skipped } = serializeSketchLayers(
          layers,
          features,
          viewer,
        )
        if (gjFeatures.length === 0) {
          throw new Error(
            skipped > 0
              ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
              : 'No features to download.',
          )
        }
        trigger(
          `mighty-twin-design-${stamp}.geojson`,
          JSON.stringify({ type: 'FeatureCollection', features: gjFeatures }, null, 2),
          'application/geo+json',
        )
      } else if (format === 'geojson_per_layer') {
        const visibleLayers = layers.filter((l) => l.visible)
        if (visibleLayers.length === 0) {
          throw new Error('No visible layers to download.')
        }
        // No JSZip dep — write per-layer files one at a time. Browsers
        // serialise these into the same downloads folder; users get a
        // small batch of named files which is fine for dev / power
        // users. (A real zip is a future iteration.)
        let writtenAny = false
        for (const layer of visibleLayers) {
          const layerFeatures = features.filter((f) => f.layerId === layer.id)
          if (layerFeatures.length === 0) continue
          const { features: gjFeatures } = serializeSketchLayers(
            [layer],
            layerFeatures,
            viewer,
          )
          if (gjFeatures.length === 0) continue
          trigger(
            `${slugify(layer.name)}-${stamp}.geojson`,
            JSON.stringify({ type: 'FeatureCollection', features: gjFeatures }, null, 2),
            'application/geo+json',
          )
          writtenAny = true
        }
        if (!writtenAny) {
          throw new Error('No serialisable features in any visible layer.')
        }
      } else {
        // Full state dump for round-trip
        const payload = {
          schema: 1,
          exported_at: new Date().toISOString(),
          layers,
          features,
        }
        trigger(
          `mighty-twin-design-state-${stamp}.json`,
          JSON.stringify(payload, null, 2),
          'application/json',
        )
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ padding: 14, color: '#f0f2f8' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          background: 'rgba(36,83,255,0.06)',
          border: '1px solid rgba(36,83,255,0.32)',
          borderRadius: 10,
          marginBottom: 12,
        }}
      >
        <Download size={18} color="#9bb3ff" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {summary.featureCount} feature{summary.featureCount === 1 ? '' : 's'} ready
          </div>
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
            From {summary.visibleLayers.length} visible / {summary.totalLayers} total
            layer{summary.totalLayers === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <FormatRow
          active={format === 'geojson_combined'}
          icon={<MapIcon size={16} />}
          title="GeoJSON · combined"
          subtitle="One FeatureCollection with all visible features"
          onClick={() => setFormat('geojson_combined')}
        />
        <FormatRow
          active={format === 'geojson_per_layer'}
          icon={<MapIcon size={16} />}
          title="GeoJSON · per layer"
          subtitle="One file per visible layer (sequential downloads)"
          onClick={() => setFormat('geojson_per_layer')}
        />
        <FormatRow
          active={format === 'json_state'}
          icon={<Code size={16} />}
          title="Design state · JSON"
          subtitle="Full sketch state for round-trip into another Twin"
          onClick={() => setFormat('json_state')}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 7,
            color: '#fca5a5',
            fontSize: 11,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <X size={12} /> {error}
        </div>
      )}

      <button
        onClick={download}
        disabled={downloading || summary.featureCount === 0}
        style={{
          width: '100%',
          padding: '10px',
          background: summary.featureCount > 0 ? '#2453ff' : 'rgba(255,255,255,0.04)',
          border: 'none',
          borderRadius: 8,
          color: summary.featureCount > 0 ? '#fff' : 'rgba(240,242,248,0.4)',
          fontSize: 13,
          fontWeight: 500,
          cursor:
            downloading || summary.featureCount === 0 ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {downloading ? (
          <>
            <Loader size={14} className="spin" /> Preparing…
          </>
        ) : (
          <>
            <Download size={14} /> Download
          </>
        )}
      </button>
    </div>
  )
}

function FormatRow({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 10,
        background: active ? 'rgba(36,83,255,0.10)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 8,
        color: '#f0f2f8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        font: 'inherit',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: active ? 'rgba(36,83,255,0.18)' : 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? '#9bb3ff' : 'rgba(240,242,248,0.7)',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 10, color: 'rgba(240,242,248,0.5)', marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
    </button>
  )
}

function slugify(s: string): string {
  return (s || 'sketch').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sketch'
}
