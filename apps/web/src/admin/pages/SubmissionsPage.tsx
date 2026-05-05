/** Atlas Submissions queue — Phase O + T (T+300).
 *
 *  Backend contract is now real (see twin_api.submission_routes), this
 *  page is the moderator surface:
 *
 *    pending → Approve / Reject
 *    approved → Promote (with target layer picker)
 *    rejected → archived (read-only)
 *    promoted → shows resolved layer + count
 *
 *  Status filter is a chip row at the top. Each row expands to show
 *  schema changes + submission notes + (when promoted) which layer the
 *  features ended up in.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Inbox,
  Layers,
  Loader,
  Send,
  XCircle,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useToast } from '../../viewer/hooks/useToast'

type Status = 'pending' | 'approved' | 'rejected' | 'promoted'

interface Submission {
  id: string
  status: Status
  site_id: string
  site_slug: string
  site_name: string
  submitter_name: string
  submitter_email: string
  feature_count: number
  schema_changes: { field: string; from: string | null; to: string }[]
  notes: string | null
  review_notes: string | null
  reviewed_at: string | null
  promoted_layer_id: string | null
  promoted_feature_count: number | null
  created_at: string
}

interface SiteLayer {
  id: string
  name: string
  type: string
}

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof CircleDot }> = {
  pending: { label: 'Pending', color: '#f59e0b', icon: CircleDot },
  approved: { label: 'Approved', color: '#2dd4bf', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: '#fb7185', icon: XCircle },
  promoted: { label: 'Promoted', color: '#a78bfa', icon: Send },
}

export default function SubmissionsPage() {
  const { isPhone } = useBreakpoint()
  const [status, setStatus] = useState<Status>('pending')
  const [items, setItems] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<Status, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
    promoted: 0,
  })

  async function refresh(s: Status = status) {
    setLoading(true)
    setError(null)
    try {
      const data = (await apiFetch(`/api/design/submissions?status=${s}`)) as Submission[]
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      const msg = (e as Error).message
      // 404 → no submissions endpoint yet; treat as empty list, not error.
      if (msg.includes('404') || msg.includes('not found')) {
        setItems([])
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // Pre-fetch counts for the chip row.
  useEffect(() => {
    Promise.all(
      (['pending', 'approved', 'rejected', 'promoted'] as Status[]).map((s) =>
        apiFetch(`/api/design/submissions?status=${s}`)
          .then((d) => [s, Array.isArray(d) ? (d as unknown[]).length : 0] as const)
          .catch(() => [s, 0] as const),
      ),
    ).then((pairs) => {
      const next: Record<Status, number> = {
        pending: 0,
        approved: 0,
        rejected: 0,
        promoted: 0,
      }
      pairs.forEach(([k, v]) => (next[k] = v))
      setCounts(next)
    })
  }, [])

  useEffect(() => {
    refresh(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Submissions</h1>
        <p
          style={{
            margin: '4px 0 0',
            color: 'rgba(240,242,248,0.5)',
            fontSize: 13,
          }}
        >
          Design-widget sketches awaiting moderation before they're promoted into a site's
          authoritative layer.
        </p>
      </header>

      {/* Status chip row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'promoted'] as Status[]).map((s) => {
          const meta = STATUS_META[s]
          const Icon = meta.icon
          const active = status === s
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: `1px solid ${active ? meta.color : 'rgba(255,255,255,0.07)'}`,
                background: active ? `${meta.color}1f` : 'transparent',
                color: active ? meta.color : 'rgba(240,242,248,0.6)',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 500,
              }}
            >
              <Icon size={12} />
              {meta.label}
              <span
                style={{
                  padding: '1px 6px',
                  background: active ? meta.color : 'rgba(255,255,255,0.05)',
                  color: active ? '#0f0f14' : 'rgba(240,242,248,0.5)',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {counts[s]}
              </span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div style={{ color: 'rgba(240,242,248,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader size={14} className="spin" /> Loading submissions…
        </div>
      )}
      {error && (
        <div
          style={{
            padding: 12,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 8,
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}
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
            No {STATUS_META[status].label.toLowerCase()} submissions
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            When a user submits a Design-widget sketch for review, it appears here.
          </div>
        </div>
      )}

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {items.map((s) => (
          <SubmissionRow
            key={s.id}
            sub={s}
            onAfterAction={() => {
              refresh()
              // Refresh counts opportunistically.
              setCounts((prev) => {
                const next = { ...prev }
                if (status === 'pending') next.pending = Math.max(0, next.pending - 1)
                return next
              })
            }}
          />
        ))}
      </ul>
    </div>
  )
}

function SubmissionRow({
  sub,
  onAfterAction,
}: {
  sub: Submission
  onAfterAction: () => void
}) {
  const { addToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const meta = STATUS_META[sub.status]

  async function act(kind: 'approve' | 'reject') {
    const reason =
      kind === 'reject'
        ? prompt('Reason for rejection (optional)?') ?? undefined
        : undefined
    setBusy(true)
    try {
      await apiFetch(`/api/design/submissions/${sub.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      })
      addToast(
        'success',
        `Submission ${kind === 'approve' ? 'approved' : 'rejected'}.`,
      )
      onAfterAction()
    } catch (e) {
      addToast('error', `${kind} failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${meta.color}33`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: 4,
            background: 'transparent',
            border: 'none',
            color: 'rgba(240,242,248,0.5)',
            cursor: 'pointer',
            lineHeight: 0,
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
            }}
          >
            <Link
              to={`/admin/sites/${encodeURIComponent(sub.site_slug)}`}
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#f0f2f8', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              {sub.site_name}
            </Link>
            <span
              style={{
                padding: '1px 8px',
                background: `${meta.color}22`,
                color: meta.color,
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                borderRadius: 999,
              }}
            >
              {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
            {sub.submitter_name} · {sub.feature_count} feature
            {sub.feature_count === 1 ? '' : 's'} ·{' '}
            {new Date(sub.created_at).toLocaleString()}
          </div>
        </div>
        {sub.status === 'pending' && (
          <>
            <button
              onClick={() => act('reject')}
              disabled={busy}
              style={{
                padding: '7px 14px',
                borderRadius: 7,
                border: '1px solid rgba(251,113,133,0.32)',
                background: 'transparent',
                color: '#fb7185',
                fontSize: 12,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              Reject
            </button>
            <button
              onClick={() => act('approve')}
              disabled={busy}
              style={{
                padding: '7px 14px',
                borderRadius: 7,
                border: 'none',
                background: '#2453ff',
                color: '#fff',
                fontSize: 12,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              Approve
            </button>
          </>
        )}
        {sub.status === 'approved' && (
          <PromoteButton sub={sub} onDone={onAfterAction} />
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 22 }}>
          {sub.notes && (
            <Section label="Submitter notes">
              <div style={{ color: 'rgba(240,242,248,0.7)' }}>{sub.notes}</div>
            </Section>
          )}
          {sub.review_notes && (
            <Section label={sub.status === 'rejected' ? 'Rejection reason' : 'Review notes'}>
              <div style={{ color: 'rgba(240,242,248,0.7)' }}>{sub.review_notes}</div>
            </Section>
          )}
          {sub.schema_changes && sub.schema_changes.length > 0 && (
            <Section label="Schema changes">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sub.schema_changes.map((c, i) => (
                  <li key={i}>
                    <code>{c.field}</code>: {c.from ?? '(new)'} →{' '}
                    <code>{c.to}</code>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {sub.status === 'promoted' && (
            <Section label="Promoted to">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#a78bfa',
                  fontSize: 12,
                }}
              >
                <Layers size={12} /> Layer{' '}
                <code>{sub.promoted_layer_id?.slice(0, 8)}…</code> ·{' '}
                {sub.promoted_feature_count} feature
                {sub.promoted_feature_count === 1 ? '' : 's'} inserted
              </div>
            </Section>
          )}
        </div>
      )}
    </li>
  )
}

function PromoteButton({ sub, onDone }: { sub: Submission; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [layers, setLayers] = useState<SiteLayer[]>([])
  const [target, setTarget] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    apiFetch(`/api/spatial/sites/${sub.site_slug}/layers`)
      .then((d) => setLayers((d as SiteLayer[]) ?? []))
      .catch((e) => setErr((e as Error).message))
  }, [open, sub.site_slug])

  async function promote() {
    if (!target) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch(`/api/design/submissions/${sub.id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ target_layer_id: target }),
      })
      setOpen(false)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '7px 14px',
          borderRadius: 7,
          border: '1px solid rgba(167,139,250,0.32)',
          background: 'rgba(167,139,250,0.10)',
          color: '#a78bfa',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Send size={12} /> Promote
      </button>
    )
  }

  const eligible = useMemo(
    () => layers.filter((l) => l.type === 'feature' || l.type === 'geojson' || l.type === 'vector'),
    [layers],
  )

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>Promote submission</h3>
        <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.55)', marginBottom: 14 }}>
          Pick a target layer in <strong>{sub.site_name}</strong>.{' '}
          {sub.feature_count} feature{sub.feature_count === 1 ? '' : 's'} will be inserted.
        </div>
        {layers.length === 0 ? (
          <div
            style={{
              padding: 12,
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.32)',
              borderRadius: 8,
              color: '#f59e0b',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            This site has no layers. Create a layer first, then promote the submission into it.
          </div>
        ) : (
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 7,
              color: '#f0f2f8',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            <option value="" disabled>
              Choose layer…
            </option>
            {(eligible.length > 0 ? eligible : layers).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.type}
              </option>
            ))}
          </select>
        )}
        {err && (
          <div
            style={{
              padding: 8,
              background: 'rgba(251,113,133,0.06)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 7,
              color: '#fca5a5',
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => setOpen(false)} disabled={busy} style={ghost}>
            Cancel
          </button>
          <button
            onClick={promote}
            disabled={busy || !target}
            style={{ ...primary, opacity: busy || !target ? 0.5 : 1 }}
          >
            {busy ? <Loader size={12} className="spin" /> : <Send size={12} />}
            {busy ? 'Promoting…' : 'Promote'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          color: 'rgba(240,242,248,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: 10,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.7)' }}>{children}</div>
    </div>
  )
}

const primary: React.CSSProperties = {
  padding: '7px 12px',
  background: '#a78bfa',
  border: 'none',
  borderRadius: 7,
  color: '#0f0f14',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghost: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}
