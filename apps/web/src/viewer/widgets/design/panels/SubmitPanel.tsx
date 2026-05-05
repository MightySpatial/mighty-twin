/** SubmitPanel — Design-widget submit-for-moderation surface (T+420).
 *
 *  Reads the live SketchFeatures from the design state, serialises
 *  each visible layer's features into GeoJSON via
 *  serializeSketchLayers, and POSTs to /api/design/submissions.
 *
 *  Keeps a tight state machine — idle → submitting → submitted | error —
 *  so users can see what happened. Submitted submissions are
 *  immediately visible to admins in the Atlas Submissions queue.
 */

import { useState } from 'react'
import { CheckCircle2, Inbox, Loader, Send, AlertCircle } from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { serializeSketchLayers } from '../serializeFeatures'

const API_URL = import.meta.env.VITE_API_URL || ''

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
  siteSlug: string | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; id: string; count: number; skipped: number }
  | { kind: 'error'; message: string }

export default function SubmitPanel({ viewer, layers, features, siteSlug }: Props) {
  const [notes, setNotes] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  // Pre-compute serialized features so the user can see what they'll be sending.
  const serialized = serializeSketchLayers(layers, features, viewer)
  const visible = serialized.features.length

  async function submit() {
    if (!siteSlug) {
      setState({ kind: 'error', message: 'No site context — open this widget on a site.' })
      return
    }
    if (visible === 0) {
      setState({
        kind: 'error',
        message: 'Nothing to submit — draw at least one feature first.',
      })
      return
    }
    setState({ kind: 'submitting' })
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${API_URL}/api/design/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          site_slug: siteSlug,
          features: serialized.features,
          schema_changes: [],
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `Submit failed (${res.status})`)
      }
      const out = (await res.json()) as { id: string }
      setState({
        kind: 'success',
        id: out.id,
        count: serialized.features.length,
        skipped: serialized.skipped,
      })
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message })
    }
  }

  if (state.kind === 'success') {
    return (
      <div
        style={{
          padding: 18,
          textAlign: 'center',
          color: '#f0f2f8',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'rgba(45,212,191,0.12)',
            color: '#2dd4bf',
            marginBottom: 12,
          }}
        >
          <CheckCircle2 size={28} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Submitted</div>
        <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.55)', marginBottom: 14 }}>
          {state.count} feature{state.count === 1 ? '' : 's'} sent for review.
          {state.skipped > 0 && (
            <>
              {' '}
              {state.skipped} feature{state.skipped === 1 ? '' : 's'} couldn't be
              serialized — usually means the entity has no geometry yet.
            </>
          )}
        </div>
        <code
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            color: 'rgba(240,242,248,0.7)',
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        >
          ref: {state.id.slice(0, 8)}…
        </code>
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setState({ kind: 'idle' })} style={ghostBtn}>
            Submit another
          </button>
        </div>
      </div>
    )
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
          marginBottom: 14,
        }}
      >
        <Inbox size={18} color="#9bb3ff" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {visible} feature{visible === 1 ? '' : 's'} ready to submit
          </div>
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
            From {layers.filter((l) => l.visible).length} visible layer
            {layers.filter((l) => l.visible).length === 1 ? '' : 's'}
            {serialized.skipped > 0 && (
              <>
                {' '}
                · {serialized.skipped} skipped (no geometry)
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(240,242,248,0.5)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Notes for the reviewer (optional)
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything the reviewer should know?"
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 7,
            color: '#f0f2f8',
            fontSize: 12,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {state.kind === 'error' && (
        <div
          style={{
            padding: 10,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 7,
            color: '#fca5a5',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <AlertCircle size={14} />
          {state.message}
        </div>
      )}

      <button
        onClick={submit}
        disabled={state.kind === 'submitting' || visible === 0}
        style={{
          width: '100%',
          padding: '10px',
          background: visible > 0 ? '#2453ff' : 'rgba(255,255,255,0.04)',
          border: 'none',
          borderRadius: 8,
          color: visible > 0 ? '#fff' : 'rgba(240,242,248,0.4)',
          fontSize: 13,
          fontWeight: 500,
          cursor: state.kind === 'submitting' || visible === 0 ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {state.kind === 'submitting' ? (
          <>
            <Loader size={14} className="spin" /> Submitting…
          </>
        ) : (
          <>
            <Send size={14} /> Submit for review
          </>
        )}
      </button>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}
