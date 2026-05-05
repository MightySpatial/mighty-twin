/** SnapshotWidget — capture, name, share to gallery.
 *
 *  Mounted by the host (CesiumViewer) when the user activates the Snap
 *  tile in the bottom rail. Renders a small modal that:
 *    - Shows a live thumbnail preview captured at open
 *    - Lets the user name it + add a description
 *    - Toggles "Share to site gallery" for admins / co-owners
 *    - POSTs to /me/snapshots and dismisses
 *
 *  The widget only captures view state. The Snapshot model on the
 *  backend handles per-user S3 quota and gallery toggles.
 */

import { useEffect, useState } from 'react'
import { Camera, Image as ImageIcon, Loader, Share2, X } from 'lucide-react'
import type { Viewer } from 'cesium'
import { useSnapshot } from './useSnapshot'

const API_URL = import.meta.env.VITE_API_URL || ''

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>
  siteSlug: string | null
  layers: { id: string; visible: boolean; opacity: number }[]
  isMobile: boolean
  onClose: () => void
  onSaved?: (id: string) => void
}

export default function SnapshotWidget({
  viewerRef,
  siteSlug,
  layers,
  isMobile,
  onClose,
  onSaved,
}: Props) {
  const { busy, setBusy, capturePayload } = useSnapshot(viewerRef)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [shareToGallery, setShareToGallery] = useState(false)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReturnType<typeof capturePayload> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Capture once on mount so the preview matches what the user saw
  // when they tapped Snap. Re-captures only on explicit "Recapture".
  useEffect(() => {
    const p = capturePayload(layers)
    setPayload(p)
    setThumbnail(p.thumbnail_url)
    // Default name = "Snapshot" + local time
    const t = new Date()
    setName(
      `Snapshot ${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function recapture() {
    const p = capturePayload(layers)
    setPayload(p)
    setThumbnail(p.thumbnail_url)
  }

  async function save() {
    if (!name.trim() || !payload) return
    setBusy(true)
    setError(null)
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${API_URL}/api/me/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          site_slug: siteSlug,
          name: name.trim(),
          description: description.trim() || null,
          payload,
          shared_to_gallery: shareToGallery,
        }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `Save failed (${res.status})`)
      }
      const saved = (await res.json()) as { id: string }
      onSaved?.(saved.id)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Slightly different placement on mobile: bottom sheet vs centered modal.
  const wrapperStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 80,
        background: 'rgba(15,15,20,0.98)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: 18,
        animation: 'snapSheetIn 220ms ease-out',
      }
    : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 80,
        width: 480,
        maxWidth: 'calc(100vw - 32px)',
        background: 'rgba(15,15,20,0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 18,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        color: '#f0f2f8',
      }

  return (
    <>
      <style>{`
        @keyframes snapSheetIn {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 79,
          backdropFilter: 'blur(6px)',
        }}
      />
      <div style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
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
              color: '#f0f2f8',
            }}
          >
            <Camera size={16} /> New snapshot
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

        {/* Thumbnail */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 3',
            background: thumbnail
              ? `center/cover no-repeat url(${thumbnail})`
              : 'linear-gradient(135deg, rgba(36,83,255,0.4), rgba(167,139,250,0.4))',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 12,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!thumbnail && <ImageIcon size={28} color="#fff" />}
          <button
            onClick={recapture}
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              backdropFilter: 'blur(4px)',
            }}
          >
            <Camera size={11} /> Recapture
          </button>
        </div>

        {/* Inputs */}
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Snapshot name"
            style={inputStyle}
            autoFocus
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's interesting about this view?"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        {/* Share toggle — only when we have a site context */}
        {siteSlug && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              background: shareToGallery ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${shareToGallery ? 'rgba(45,212,191,0.32)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            <input
              type="checkbox"
              checked={shareToGallery}
              onChange={(e) => setShareToGallery(e.target.checked)}
              style={{ accentColor: '#2dd4bf' }}
            />
            <Share2 size={14} color={shareToGallery ? '#2dd4bf' : 'rgba(240,242,248,0.5)'} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: shareToGallery ? '#f0f2f8' : 'rgba(240,242,248,0.85)',
                }}
              >
                Share to site gallery
              </div>
              <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
                Visible to anyone with access to this site.
              </div>
            </div>
          </label>
        )}

        {error && (
          <div
            style={{
              padding: 10,
              background: 'rgba(251,113,133,0.06)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 7,
              color: '#fca5a5',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            style={{
              ...primaryBtn,
              opacity: busy || !name.trim() ? 0.5 : 1,
            }}
          >
            {busy ? <Loader size={12} className="spin" /> : <Camera size={12} />}
            {busy ? 'Saving…' : 'Save snapshot'}
          </button>
        </div>
      </div>
    </>
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
          color: 'rgba(240,242,248,0.5)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
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
