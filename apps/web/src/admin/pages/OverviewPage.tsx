/** Atlas Overview page — Phase N.
 *
 *  Workspace-level KPI dashboard. Single fetch from /api/atlas/overview
 *  populates every card. Mounted as the first sidebar item in
 *  AdminRoot, replacing the previous Sites-as-landing default.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'

interface Overview {
  counts: {
    users: number
    active_users: number
    sites: number
    public_sites: number
    layers: number
    data_sources: number
    story_maps: number
    snapshots: number
  }
  activity: {
    snapshots_last_7d: number
    snapshots_last_24h: number
    users_added_last_7d: number
    sites_added_last_7d: number
  }
  top_sites: { slug: string; name: string; snapshots_30d: number }[]
  recent_snapshots: {
    id: string
    name: string
    site_slug: string | null
    site_name: string | null
    created_at: string | null
  }[]
  generated_at: string
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/atlas/overview')
      .then((d) => {
        if (!cancelled) setData(d as Overview)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#fca5a5' }}>Couldn't load overview: {error}</div>
      </div>
    )
  }
  if (!data) return <div style={pageStyle}>Loading…</div>

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Overview</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
          Workspace at a glance — sites, users, recent activity.
        </p>
      </header>

      <section style={gridSection}>
        <Stat label="Sites" value={data.counts.sites} sub={`${data.counts.public_sites} public`} />
        <Stat label="Active users" value={data.counts.active_users} sub={`of ${data.counts.users} total`} />
        <Stat label="Layers" value={data.counts.layers} />
        <Stat label="Data sources" value={data.counts.data_sources} />
        <Stat label="Story maps" value={data.counts.story_maps} />
        <Stat label="Snapshots" value={data.counts.snapshots} />
      </section>

      <section style={gridSection}>
        <Stat label="Snapshots · last 24h" value={data.activity.snapshots_last_24h} accent="#34d399" />
        <Stat label="Snapshots · last 7d" value={data.activity.snapshots_last_7d} accent="#34d399" />
        <Stat label="Users added · last 7d" value={data.activity.users_added_last_7d} accent="#a78bfa" />
        <Stat label="Sites added · last 7d" value={data.activity.sites_added_last_7d} accent="#2dd4bf" />
      </section>

      <section style={twoCol}>
        <Card title="Top sites · last 30 days">
          {data.top_sites.length === 0 ? (
            <Empty>No site activity yet.</Empty>
          ) : (
            <ul style={listReset}>
              {data.top_sites.map((s) => (
                <li key={s.slug} style={listItem}>
                  <Link
                    to={`/admin/sites/${encodeURIComponent(s.slug)}`}
                    style={{ color: '#f0f2f8', textDecoration: 'none', flex: 1 }}
                  >
                    {s.name}
                  </Link>
                  <span style={{ color: 'rgba(240,242,248,0.5)', fontSize: 12 }}>
                    {s.snapshots_30d} snapshot{s.snapshots_30d === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent snapshots">
          {data.recent_snapshots.length === 0 ? (
            <Empty>No snapshots taken yet.</Empty>
          ) : (
            <ul style={listReset}>
              {data.recent_snapshots.map((s) => (
                <li key={s.id} style={listItem}>
                  <span style={{ flex: 1, color: '#f0f2f8' }}>{s.name}</span>
                  {s.site_slug && (
                    <Link
                      to={`/admin/sites/${encodeURIComponent(s.site_slug)}`}
                      style={{ color: 'rgba(167,139,250,0.85)', fontSize: 12, textDecoration: 'none' }}
                    >
                      {s.site_name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <p style={{ color: 'rgba(240,242,248,0.3)', fontSize: 11, marginTop: 24 }}>
        Generated {new Date(data.generated_at).toLocaleString()}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number
  sub?: string
  accent?: string
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
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,242,248,0.5)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          marginTop: 6,
          color: accent ?? '#f0f2f8',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.toLocaleString()}
      </div>
      {sub && <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(240,242,248,0.5)' }}>{sub}</div>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>{children}</div>
  )
}

const pageStyle: React.CSSProperties = { padding: 24, color: '#f0f2f8' }
const gridSection: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 24,
}
const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16,
  marginBottom: 24,
}
const listReset: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 }
const listItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  fontSize: 13,
}
