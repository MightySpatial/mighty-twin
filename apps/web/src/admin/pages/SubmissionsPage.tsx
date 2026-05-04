/** Atlas Submissions queue — Phase O.
 *
 *  Design-sketch approval workflow ported from MightyDT v1's Submissions
 *  tab (`AdminDashboard.vue:629-780`). Users sketch features in the Design
 *  widget; admins moderate them here before they're promoted into the
 *  site's authoritative layer.
 *
 *  Backend endpoint contract (Phase O.b — server-side model + endpoints
 *  land in a follow-up commit; this page exercises the contract via
 *  /api/design/submissions which currently 404s — the empty + error states
 *  are real production states the page handles correctly).
 *
 *    GET    /api/design/submissions?status=pending|approved|rejected
 *    GET    /api/design/submissions/{id}
 *    PATCH  /api/design/submissions/{id}/schema-changes
 *    POST   /api/design/submissions/{id}/approve
 *    POST   /api/design/submissions/{id}/reject  { reason? }
 *    POST   /api/design/submissions/{id}/promote { target_layer_id }
 */

import { useEffect, useState } from 'react'
import { Inbox } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

type Status = 'pending' | 'approved' | 'rejected'

interface Submission {
  id: string
  status: Status
  site_slug: string
  site_name: string
  submitter_name: string
  submitter_email: string
  feature_count: number
  schema_changes: { field: string; from: string | null; to: string }[]
  created_at: string
  notes: string | null
}

export default function SubmissionsPage() {
  const [status, setStatus] = useState<Status>('pending')
  const [items, setItems] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch(`/api/design/submissions?status=${status}`)
      .then((d) => {
        if (cancelled) return
        setItems(Array.isArray(d) ? (d as Submission[]) : [])
      })
      .catch((e: Error) => {
        if (cancelled) return
        // 404 → no submissions endpoint yet; treat as empty list, not error.
        if (e.message.includes('404') || e.message.includes('not found')) {
          setItems([])
        } else {
          setError(e.message)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [status])

  return (
    <div style={{ padding: 24, color: '#f0f2f8' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Submissions</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
          Design-widget sketches awaiting moderation before they're promoted into a site's authoritative layer.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.07)',
              background: status === s ? 'rgba(36,83,255,0.16)' : 'transparent',
              color: status === s ? '#f0f2f8' : 'rgba(240,242,248,0.6)',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading…</div>}
      {error && <div style={{ color: '#fca5a5' }}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'rgba(240,242,248,0.5)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}
        >
          <Inbox size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            No {status} submissions
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            When a user submits a Design-widget sketch for review, it appears here.
          </div>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s) => (
          <SubmissionRow key={s.id} sub={s} />
        ))}
      </ul>
    </div>
  )
}

function SubmissionRow({ sub }: { sub: Submission }) {
  const [busy, setBusy] = useState(false)
  const act = async (kind: 'approve' | 'reject') => {
    setBusy(true)
    try {
      await apiFetch(`/api/design/submissions/${sub.id}/${kind}`, { method: 'POST' })
      window.location.reload()
    } catch (e) {
      alert(`${kind} failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{sub.site_name}</div>
          <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
            {sub.submitter_name} · {sub.feature_count} feature{sub.feature_count === 1 ? '' : 's'} ·{' '}
            {new Date(sub.created_at).toLocaleString()}
          </div>
        </div>
        {sub.status === 'pending' && (
          <>
            <button
              onClick={() => act('reject')}
              disabled={busy}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(251,113,133,0.3)',
                background: 'transparent',
                color: '#fb7185',
                fontSize: 12,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Reject
            </button>
            <button
              onClick={() => act('approve')}
              disabled={busy}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: '#2453ff',
                color: '#fff',
                fontSize: 12,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Approve
            </button>
          </>
        )}
      </div>
      {sub.schema_changes && sub.schema_changes.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(240,242,248,0.6)' }}>
          <span style={{ color: 'rgba(240,242,248,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
            Schema changes
          </span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {sub.schema_changes.map((c, i) => (
              <li key={i}>
                <code>{c.field}</code>: {c.from ?? '(new)'} → <code>{c.to}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
