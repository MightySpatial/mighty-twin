/** FeatureAttributesDrawer — full-attribute side drawer.
 *
 *  Slides in from the right on desktop / tablet, takes the bottom 80%
 *  of the viewport on phone. Renders every attribute as a key-value
 *  row, copy-on-click, and a search box to filter rows.
 *
 *  Pairs with FeaturePopup: popup is the lightweight summary; drawer
 *  is the full read-only inspector. Editing UX is a separate, future
 *  surface (Design widget already covers sketch features).
 */

import { useEffect, useMemo, useState } from 'react'
import { Copy, Search, X, MapPin } from 'lucide-react'
import type { PickedFeature } from './useFeatureClick'

interface Props {
  picked: PickedFeature
  isMobile: boolean
  onClose: () => void
  onZoomTo?: () => void
}

export default function FeatureAttributesDrawer({ picked, isMobile, onClose, onZoomTo }: Props) {
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const allRows = useMemo(
    () =>
      Object.entries(picked.attributes).filter(
        ([, v]) => v != null && (typeof v !== 'string' || v !== ''),
      ),
    [picked.attributes],
  )
  const rows = useMemo(() => {
    if (!search) return allRows
    const q = search.toLowerCase()
    return allRows.filter(
      ([k, v]) =>
        k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q),
    )
  }, [allRows, search])

  function copy(value: unknown) {
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
    navigator.clipboard?.writeText(s).then(
      () => {
        setCopied(s)
        setTimeout(() => setCopied(null), 1400)
      },
      () => undefined,
    )
  }

  const drawerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '80vh',
        zIndex: 60,
        background: 'rgba(15,15,20,0.98)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fpdSlideUp 220ms ease-out',
      }
    : {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        zIndex: 60,
        background: 'rgba(15,15,20,0.98)',
        backdropFilter: 'blur(16px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '-12px 0 30px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fpdSlideRight 220ms ease-out',
      }

  return (
    <>
      <style>{`
        @keyframes fpdSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fpdSlideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 59,
            animation: 'fpdSlideUp 180ms ease-out',
          }}
        />
      )}
      <div style={drawerStyle}>
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#f0f2f8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {picked.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(240,242,248,0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 4,
              }}
            >
              {picked.source ?? 'Feature'} · {allRows.length} attribute
              {allRows.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.6)',
              cursor: 'pointer',
              lineHeight: 0,
            }}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action row */}
        {onZoomTo && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              onClick={onZoomTo}
              style={{
                padding: '6px 10px',
                background: 'rgba(45,212,191,0.10)',
                border: '1px solid rgba(45,212,191,0.32)',
                borderRadius: 6,
                color: '#2dd4bf',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <MapPin size={12} /> Zoom to feature
            </button>
          </div>
        )}

        {/* Search */}
        {allRows.length > 4 && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
              }}
            >
              <Search size={12} color="rgba(240,242,248,0.4)" />
              <input
                type="text"
                placeholder="Filter attributes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f0f2f8',
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        )}

        {/* Rows */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 8,
          }}
        >
          {rows.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'rgba(240,242,248,0.4)',
                fontSize: 12,
              }}
            >
              {search ? 'No matches' : 'No attributes on this feature'}
            </div>
          ) : (
            rows.map(([k, v]) => (
              <Row key={k} label={k} value={v} onCopy={() => copy(v)} />
            ))
          )}
        </div>

        {/* Copied toast */}
        {copied && (
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              background: 'rgba(45,212,191,0.16)',
              border: '1px solid rgba(45,212,191,0.32)',
              borderRadius: 999,
              color: '#2dd4bf',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Copied
          </div>
        )}
      </div>
    </>
  )
}

function Row({
  label,
  value,
  onCopy,
}: {
  label: string
  value: unknown
  onCopy: () => void
}) {
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return (
    <div
      style={{
        padding: '10px 12px',
        margin: '0 4px 4px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 6,
        cursor: 'pointer',
      }}
      onClick={onCopy}
      title="Click to copy"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'rgba(240,242,248,0.45)',
          }}
        >
          {label}
        </span>
        <Copy size={11} color="rgba(240,242,248,0.3)" />
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#f0f2f8',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {display}
      </div>
    </div>
  )
}
