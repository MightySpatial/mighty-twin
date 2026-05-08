/** Atlas Overview page — Phase N.
 *
 *  Workspace-level KPI dashboard. Single fetch from /api/atlas/overview
 *  populates every card. Mounted as the first sidebar item in
 *  AdminRoot, replacing the previous Sites-as-landing default.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

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
    submissions_pending: number
    submissions_total: number
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
  const { isPhone } = useBreakpoint()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pageStyle: React.CSSProperties = {
    padding: isPhone ? 14 : 24,
    paddingBottom: isPhone ? 80 : 24,
    color: '#f0f2f8',
  }
  const gridSection: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isPhone
      ? 'repeat(2, 1fr)'
      : 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 24,
  }
  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  }

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

  // Brand-new workspace shortcut: when every counter is zero, surface
  // a getting-started block above the dashboard so the first time
  // users see this page it doesn't feel like a graveyard of zeros.
  const isFreshWorkspace =
    data.counts.sites === 0 &&
    data.counts.layers === 0 &&
    data.counts.data_sources === 0 &&
    data.counts.story_maps === 0 &&
    data.counts.snapshots === 0

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Overview</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
          Workspace at a glance — sites, users, recent activity.
        </p>
      </header>

      {isFreshWorkspace && (
        <Link
          to="/admin/sites"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            marginBottom: 18,
            background:
              'linear-gradient(135deg, rgba(36,83,255,0.12), rgba(167,139,250,0.06))',
            border: '1px solid rgba(36,83,255,0.4)',
            borderRadius: 12,
            color: '#f0f2f8',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: 'linear-gradient(135deg, #2453ff, #a78bfa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            ✨
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Welcome — start with your first site
            </div>
            <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.55)', marginTop: 2 }}>
              Sites organise layers, snaps, story maps, and submissions. Pick one
              of three starting points on the Sites page.
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#9bb3ff' }}>Get started →</span>
        </Link>
      )}

      <section style={gridSection}>
        <Stat
          label="Sites"
          value={data.counts.sites}
          sub={`${data.counts.public_sites} public`}
          to="/admin/sites"
        />
        <Stat
          label="Active users"
          value={data.counts.active_users}
          sub={`of ${data.counts.users} total`}
          to="/settings#users"
        />
        <Stat label="Layers" value={data.counts.layers} to="/admin/sites" />
        <Stat label="Data sources" value={data.counts.data_sources} to="/admin/data" />
        <Stat label="Story maps" value={data.counts.story_maps} to="/admin/stories" />
        <Stat label="Snaps" value={data.counts.snapshots} to="/admin/snapshots" />
      </section>

      <section style={gridSection}>
        <Stat
          label="Snaps · last 24h"
          value={data.activity.snapshots_last_24h}
          accent="#34d399"
          to="/admin/snapshots"
        />
        <Stat
          label="Snaps · last 7d"
          value={data.activity.snapshots_last_7d}
          accent="#34d399"
          to="/admin/snapshots"
        />
        <Stat
          label="Users added · last 7d"
          value={data.activity.users_added_last_7d}
          accent="#a78bfa"
          to="/settings#users"
        />
        <Stat
          label="Sites added · last 7d"
          value={data.activity.sites_added_last_7d}
          accent="#2dd4bf"
          to="/admin/sites"
        />
      </section>

      {/* Submissions queue card — only renders when there's something to action. */}
      {data.counts.submissions_pending > 0 && (
        <Link
          to="/admin/submissions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 16,
            marginBottom: 18,
            background:
              'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04))',
            border: '1px solid rgba(245,158,11,0.32)',
            borderRadius: 12,
            color: '#f0f2f8',
            textDecoration: 'none',
            transition: 'transform 120ms',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(245,158,11,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {data.counts.submissions_pending}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f2f8' }}>
              {data.counts.submissions_pending} submission
              {data.counts.submissions_pending === 1 ? '' : 's'} awaiting review
            </div>
            <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
              {data.counts.submissions_total} submission
              {data.counts.submissions_total === 1 ? '' : 's'} total — click to open the queue
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#f59e0b' }}>Review →</span>
        </Link>
      )}

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
                    {s.snapshots_30d} snap{s.snapshots_30d === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent snaps">
          {data.recent_snapshots.length === 0 ? (
            <Empty>No snapshots taken yet.</Empty>
          ) : (
            <ul style={listReset}>
              {data.recent_snapshots.map((s) => (
                <li key={s.id} style={listItem}>
                  <Link
                    to="/admin/snapshots"
                    style={{ flex: 1, color: '#f0f2f8', textDecoration: 'none' }}
                  >
                    {s.name}
                  </Link>
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
  to,
}: {
  label: string
  value: number
  sub?: string
  accent?: string
  /** When set, the whole tile becomes a navigation link to this admin
   *  route. Hover lifts the border + adds a tiny chevron. */
  to?: string
}) {
  const content = (
    <>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        {to && <span style={{ fontSize: 11, opacity: 0.4 }}>↗</span>}
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
    </>
  )
  const baseStyle: React.CSSProperties = {
    padding: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    color: '#f0f2f8',
    textDecoration: 'none',
    transition: 'border-color 120ms, background 120ms',
  }
  if (!to) return <div style={baseStyle}>{content}</div>
  return (
    <Link
      to={to}
      className="overview-stat-link"
      style={{ ...baseStyle, display: 'block', cursor: 'pointer' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(36,83,255,0.4)'
        e.currentTarget.style.background = 'rgba(36,83,255,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
      }}
    >
      {content}
    </Link>
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

const listReset: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 }
const listItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  fontSize: 13,
}
