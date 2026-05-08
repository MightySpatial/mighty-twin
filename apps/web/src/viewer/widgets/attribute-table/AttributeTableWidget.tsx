/** Attribute Table widget — T+1080.
 *
 *  Wraps the shared @mightydt/ui AttributeTable modal with a layer
 *  picker so the viewer's bottom-rail "Table" tile can finally open
 *  it. When the site has only one feature-bearing layer the picker
 *  short-circuits and the table opens directly.
 *
 *  Fetches via /api/spatial/sites/{slug}/features?layer_id=… (T+1050
 *  endpoint), maps the FeatureCollection rows into the AttributeFeature
 *  shape the modal expects (flattened bag with id + properties).
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader, Table as TableIcon, X } from 'lucide-react'
import { AttributeTable } from '@mightydt/ui'

const API_URL = import.meta.env.VITE_API_URL || ''

interface Layer {
  id: string
  name: string
  type: string
  visible?: boolean
  feature_count?: number
}

interface Props {
  siteSlug: string
  siteName?: string
  layers: Layer[]
  isMobile: boolean
  onClose: () => void
}

export default function AttributeTableWidget({ siteSlug, siteName, layers, isMobile, onClose }: Props) {
  // Filter to layers that could possibly have rows. Cesium tile/raster
  // layer types don't have queryable attributes — exclude those so the
  // picker isn't full of dead-ends.
  const candidates = useMemo(
    () =>
      layers.filter((l) =>
        ['vector', 'geojson', 'feature', 'kml', 'czml', 'table'].includes(l.type),
      ),
    [layers],
  )

  const [layerId, setLayerId] = useState<string | null>(
    candidates.length === 1 ? candidates[0].id : null,
  )

  const fetchAttributes = useMemo(
    () =>
      async (id: string) => {
        const token = localStorage.getItem('accessToken')
        const res = await fetch(
          `${API_URL}/api/spatial/sites/${siteSlug}/features?layer_id=${id}&limit=2000`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          let msg = `Failed to load (${res.status})`
          try {
            msg = JSON.parse(text)?.detail || msg
          } catch {
            /* keep default */
          }
          throw new Error(msg)
        }
        const data = (await res.json()) as {
          features?: { id: string; properties?: Record<string, unknown> }[]
        }
        return (data.features ?? []).map((f) => ({
          id: f.id,
          ...(f.properties ?? {}),
        })) as never
      },
    [siteSlug],
  )

  // Picker → table
  const layer = candidates.find((l) => l.id === layerId)

  if (layer) {
    return (
      <AttributeTable
        layerId={layer.id}
        layerName={layer.name}
        layerMeta={{
          type: layer.type,
          site: siteName,
        }}
        fetchAttributes={fetchAttributes}
        onClose={onClose}
      />
    )
  }

  // Picker UI
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 420,
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(15,15,20,0.98)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          padding: 18,
          color: '#f0f2f8',
          maxHeight: isMobile ? '70vh' : 'calc(100vh - 80px)',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <TableIcon size={16} /> Open attribute table
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.5)',
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
        <p style={{ margin: '0 0 14px', color: 'rgba(240,242,248,0.55)', fontSize: 12 }}>
          Pick a layer to inspect its features as a sortable, searchable table.
        </p>

        {candidates.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'rgba(240,242,248,0.5)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}
          >
            <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
              No queryable layers
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Vector / GeoJSON / table layers show up here. Add one in Atlas.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayerId(l.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
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
                    background: 'rgba(36,83,255,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9bb3ff',
                    flexShrink: 0,
                  }}
                >
                  <TableIcon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)' }}>
                    {l.type}
                    {!l.visible && ' · hidden'}
                  </div>
                </div>
                <Loader size={1} style={{ display: 'none' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
