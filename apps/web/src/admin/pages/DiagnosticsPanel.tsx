/** Settings — Diagnostics panel.
 *
 *  Read-only system health view for the on-prem operator. Shows API
 *  version, DB platform + version (PostgreSQL + PostGIS), Alembic
 *  revision, and asset totals. Use it before raising a support ticket
 *  to confirm the workspace is on the expected versions.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Copy, Database, Loader, RefreshCw, Server } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

interface Diagnostics {
  api: { version: string; database_dialect: string }
  database: {
    postgresql?: string
    postgis?: string | null
    sqlite?: string
    alembic_revision?: string
    error?: string
  }
  assets: {
    features?: number
    library_items?: number
    data_sources?: number
    error?: string
  }
  checked_at: string
}

export default function DiagnosticsPanel() {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  function load() {
    setLoading(true)
    setError(null)
    apiFetch('/api/atlas/diagnostics')
      .then((d) => setData(d as Diagnostics))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function copyAll() {
    if (!data) return
    navigator.clipboard?.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={{ padding: 24, color: '#f0f2f8' }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Diagnostics</h2>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.55)', fontSize: 12 }}>
          Read-only system health check. Useful to attach when raising support
          tickets — copy the bundle below and paste it into the issue.
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={load} disabled={loading} style={primaryBtn}>
          {loading ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
        {data && (
          <button onClick={copyAll} style={ghostBtn}>
            <Copy size={12} color={copied ? '#2dd4bf' : undefined} />
            {copied ? 'Copied!' : 'Copy bundle'}
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: 'rgba(251,113,133,0.08)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 8,
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading…</div>
      )}

      {data && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card title="API" icon={<Server size={14} />}>
            <Row label="Version">{data.api.version}</Row>
            <Row label="DB engine">{data.api.database_dialect}</Row>
          </Card>

          <Card title="Database" icon={<Database size={14} />}>
            {data.database.postgresql && (
              <Row label="PostgreSQL">{data.database.postgresql}</Row>
            )}
            {data.database.postgis !== undefined && (
              <Row label="PostGIS">{data.database.postgis ?? '(not installed)'}</Row>
            )}
            {data.database.sqlite && (
              <Row label="SQLite">{data.database.sqlite}</Row>
            )}
            {data.database.alembic_revision && (
              <Row label="Schema revision">
                <code
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: '#9bb3ff',
                  }}
                >
                  {data.database.alembic_revision}
                </code>
              </Row>
            )}
            {data.database.error && (
              <Row label="Error">
                <span style={{ color: '#fca5a5' }}>{data.database.error}</span>
              </Row>
            )}
          </Card>

          <Card title="Assets" icon={<Database size={14} />}>
            {typeof data.assets.features === 'number' && (
              <Row label="Features (geometry rows)">
                {data.assets.features.toLocaleString()}
              </Row>
            )}
            {typeof data.assets.library_items === 'number' && (
              <Row label="Library items">
                {data.assets.library_items.toLocaleString()}
              </Row>
            )}
            {typeof data.assets.data_sources === 'number' && (
              <Row label="Data sources">
                {data.assets.data_sources.toLocaleString()}
              </Row>
            )}
            {data.assets.error && (
              <Row label="Error">
                <span style={{ color: '#fca5a5' }}>{data.assets.error}</span>
              </Row>
            )}
          </Card>

          <p style={{ color: 'rgba(240,242,248,0.4)', fontSize: 11, margin: 0 }}>
            Checked {new Date(data.checked_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          fontSize: 13,
          fontWeight: 600,
          color: '#9bb3ff',
        }}
      >
        {icon}
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 200,
          color: 'rgba(240,242,248,0.55)',
          fontSize: 12,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '7px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
