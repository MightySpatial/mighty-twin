/** Bulk feature import modal — T+1390.
 *
 *  Triggered from a LayerRow's Upload button on SiteDetail. Lets the
 *  admin pick a .geojson, .json, or .csv and POST it to the new
 *  /import-features endpoint with optional source SRID + (CSV)
 *  column mapping + replace_existing toggle.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, FileText, Loader, Upload, X } from 'lucide-react'
import { API_URL } from '../hooks/useApi'

interface LayerLike {
  id: string
  name: string
}

interface Props {
  siteSlug: string
  layer: LayerLike
  onClose: () => void
  onDone: (counts: { inserted: number; skipped: number }) => void
}

type Format = 'geojson' | 'csv' | null

export default function LayerImportModal({ siteSlug, layer, onClose, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<Format>(null)
  const [sourceSrid, setSourceSrid] = useState(4326)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [lngColumn, setLngColumn] = useState('')
  const [latColumn, setLatColumn] = useState('')
  const [wktColumn, setWktColumn] = useState('')
  const [csvFields, setCsvFields] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setFormat(null)
      setCsvFields([])
      return
    }
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
      setFormat('geojson')
      setCsvFields([])
    } else if (lower.endsWith('.csv')) {
      setFormat('csv')
      // Peek the first line to surface column names for the mapper.
      file.text().then((text) => {
        const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
        const fields = firstLine.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
        setCsvFields(fields)
        // Auto-pick lng/lat if obvious.
        const lower = fields.map((f) => f.toLowerCase())
        const lngIdx = lower.findIndex((f) =>
          ['longitude', 'lon', 'long', 'lng', 'x'].includes(f),
        )
        const latIdx = lower.findIndex((f) =>
          ['latitude', 'lat', 'y'].includes(f),
        )
        if (lngIdx >= 0) setLngColumn(fields[lngIdx])
        if (latIdx >= 0) setLatColumn(fields[latIdx])
      })
    } else {
      setFormat(null)
      setErr('Unsupported file type — pick a .geojson, .json, or .csv')
    }
  }, [file])

  async function submit() {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source_srid', String(sourceSrid))
      fd.append('replace_existing', replaceExisting ? 'true' : 'false')
      if (format === 'csv') {
        if (lngColumn) fd.append('lng_column', lngColumn)
        if (latColumn) fd.append('lat_column', latColumn)
        if (wktColumn) fd.append('wkt_column', wktColumn)
      }
      const token = localStorage.getItem('accessToken')
      const res = await fetch(
        `${API_URL}/api/spatial/sites/${siteSlug}/layers/${layer.id}/import-features`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        },
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        let msg = `Import failed (${res.status})`
        try {
          msg = JSON.parse(body)?.detail || msg
        } catch {
          /* keep default */
        }
        throw new Error(msg)
      }
      const result = (await res.json()) as { inserted: number; skipped: number }
      onDone(result)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
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
            <Upload size={16} /> Import features → {layer.name}
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

        <div
          style={{
            padding: 12,
            background: 'rgba(36,83,255,0.06)',
            border: '1px dashed rgba(36,83,255,0.32)',
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <input
            type="file"
            accept=".geojson,.json,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ width: '100%', color: '#f0f2f8', fontSize: 13 }}
          />
          {file && (
            <div
              style={{
                fontSize: 11,
                color: 'rgba(240,242,248,0.55)',
                marginTop: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={11} />
              {file.name} · {Math.round(file.size / 1024)} KB ·{' '}
              {format ? format.toUpperCase() : 'unsupported'}
            </div>
          )}
        </div>

        <Field label="Source CRS">
          <select
            value={sourceSrid}
            onChange={(e) => setSourceSrid(parseInt(e.target.value, 10))}
            style={input()}
          >
            <option value={4326}>4326 — WGS84 (lat/lon)</option>
            <option value={3857}>3857 — Web Mercator</option>
            <option value={28350}>28350 — MGA2020 Zone 50 (WA)</option>
            <option value={28354}>28354 — MGA2020 Zone 54</option>
            <option value={28355}>28355 — MGA2020 Zone 55</option>
            <option value={28356}>28356 — MGA2020 Zone 56 (NSW)</option>
            <option value={7856}>7856 — GDA2020 / MGA Zone 56</option>
          </select>
        </Field>

        {format === 'csv' && csvFields.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(240,242,248,0.55)',
                marginBottom: 6,
              }}
            >
              CSV detected. Pick how to read geometry from each row:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Longitude column">
                <select
                  value={lngColumn}
                  onChange={(e) => setLngColumn(e.target.value)}
                  style={input()}
                >
                  <option value="">— choose —</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Latitude column">
                <select
                  value={latColumn}
                  onChange={(e) => setLatColumn(e.target.value)}
                  style={input()}
                >
                  <option value="">— choose —</option>
                  {csvFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Or, WKT column (alternative to lng/lat)">
              <select
                value={wktColumn}
                onChange={(e) => setWktColumn(e.target.value)}
                style={input()}
              >
                <option value="">— none —</option>
                {csvFields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 10,
            background: replaceExisting
              ? 'rgba(245,158,11,0.06)'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${replaceExisting ? 'rgba(245,158,11,0.32)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 7,
            cursor: 'pointer',
            margin: '12px 0',
          }}
        >
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
          />
          <span style={{ fontSize: 12 }}>
            Replace existing features in this layer (otherwise rows are appended)
          </span>
        </label>

        {err && (
          <div
            style={{
              padding: 8,
              background: 'rgba(251,113,133,0.08)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 7,
              color: '#fca5a5',
              fontSize: 11,
              marginBottom: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertCircle size={12} /> {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !file || !format}
            style={{
              ...primaryBtn,
              opacity: busy || !file || !format ? 0.5 : 1,
            }}
          >
            {busy ? <Loader size={12} className="spin" /> : <Upload size={12} />}
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'rgba(240,242,248,0.55)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function input(): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 7,
    color: '#f0f2f8',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}
