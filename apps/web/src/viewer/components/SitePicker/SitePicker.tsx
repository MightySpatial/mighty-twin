/** SitePicker — popover from the MapShell site chip.
 *
 *  Lists every site the user has access to (the API filters by role).
 *  Includes a search box + recent sites pinned to the top. Clicking a
 *  site navigates to its viewer page. Cobalt-themed to match the rest
 *  of MapShell.
 *
 *  This component is presentation only — the host (CesiumViewer or
 *  ViewerPage) decides whether to mount it and what to do on select.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Globe,
  Layers,
  Lock,
  Search,
  X,
} from 'lucide-react'

export interface SiteEntry {
  slug: string
  name: string
  description?: string | null
  is_public_pre_login?: boolean
  layer_count?: number
  primary_color?: string
}

interface Props {
  sites: SiteEntry[]
  currentSlug: string | null
  loading?: boolean
  /** When true, the popover renders as a phone-friendly bottom sheet
   *  with a backdrop instead of a top-left popover. */
  isMobile?: boolean
  onClose: () => void
  onSelect: (slug: string) => void
}

const RECENT_KEY = 'mighty:recent-sites'
const RECENT_MAX = 4

export function pushRecentSite(slug: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const next = [slug, ...cur.filter((s) => s !== slug)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* localStorage unavailable */
  }
}

export default function SitePicker({
  sites,
  currentSlug,
  loading,
  isMobile = false,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Mobile swipe-to-close + smooth in/out animation.
  //
  // The sheet starts off-screen (translateY 100%), animates up to 0 on
  // mount, follows finger drag while pointer-down on the header/handle,
  // and either snaps back or animates out depending on travel +
  // velocity. Threshold: 80px or 0.5px/ms triggers close.
  const dragState = useRef<{ startY: number; startT: number; lastY: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!isMobile) return
    // One paint with translateY(100%), then animate to 0.
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [isMobile])

  function onSheetPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isMobile) return
    const target = e.target as HTMLElement
    if (!target.closest('[data-sheet-grab]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startY: e.clientY, startT: Date.now(), lastY: e.clientY }
    setIsDragging(true)
  }
  function onSheetPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return
    const dy = Math.max(0, e.clientY - dragState.current.startY)
    dragState.current.lastY = e.clientY
    setDragOffset(dy)
  }
  function onSheetPointerEnd() {
    if (!dragState.current) return
    const totalDy = dragState.current.lastY - dragState.current.startY
    const elapsed = Math.max(1, Date.now() - dragState.current.startT)
    const velocity = totalDy / elapsed
    dragState.current = null
    setIsDragging(false)
    if (totalDy > 80 || velocity > 0.5) {
      setClosing(true)
      window.setTimeout(onClose, 220)
    } else {
      setDragOffset(0)
    }
  }

  // Auto-focus search; close on Esc or outside click.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    // Defer to next tick so the click that opened the picker doesn't immediately close it.
    const timer = setTimeout(() => window.addEventListener('click', onClick), 50)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
      clearTimeout(timer)
    }
  }, [onClose])

  const recentSlugs = useMemo<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    } catch {
      return []
    }
  }, [])

  const { recent, all } = useMemo(() => {
    const q = query.toLowerCase().trim()
    const matches = (s: SiteEntry) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    const visible = sites.filter(matches)
    if (q) {
      // Searching → suppress the "Recent" section, just show results.
      return { recent: [], all: visible }
    }
    const recentSet = new Set(recentSlugs)
    const recent = recentSlugs
      .map((slug) => visible.find((s) => s.slug === slug))
      .filter((x): x is SiteEntry => Boolean(x) && x!.slug !== currentSlug)
    const all = visible.filter((s) => !recentSet.has(s.slug))
    return { recent, all }
  }, [sites, query, recentSlugs, currentSlug])

  const containerStyle: React.CSSProperties = isMobile
    ? {
        // Phone — full-width bottom sheet, taller (90vh) than before
        // so it feels closer to a full-screen takeover. Animated via
        // transform so the swipe-to-close gesture maps 1:1 with the
        // user's finger.
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '90vh',
        background: 'rgba(13,14,20,0.99)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.09)',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: closing
          ? 'translateY(100%)'
          : !mounted
          ? 'translateY(100%)'
          : `translateY(${dragOffset}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 240ms cubic-bezier(0.32,0.72,0,1)',
        touchAction: 'none',
      }
    : {
        // Desktop — dropdown under the top-left bar
        position: 'absolute',
        top: 58,  // 14px bar offset + ~38px bar height + 6px gap
        left: 14,
        width: 320,
        maxHeight: 'calc(100vh - 120px)',
        background: 'rgba(13,14,20,0.98)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 14,
        boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'spickerIn 180ms cubic-bezier(0.22,1,0.36,1)',
      }

  return (
    <>
      <style>{`
        @keyframes spickerIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spickerSlide {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop (mobile only) — opacity fades with the drag so the
          map peeks through as the sheet slides down. */}
      {isMobile && (
        <div
          onClick={() => {
            setClosing(true)
            window.setTimeout(onClose, 220)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 59,
            opacity:
              closing || !mounted
                ? 0
                : Math.max(0, 1 - dragOffset / 320),
            transition: isDragging
              ? 'none'
              : 'opacity 220ms cubic-bezier(0.32,0.72,0,1)',
          }}
        />
      )}

      <div
        ref={containerRef}
        style={containerStyle}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerEnd}
        onPointerCancel={onSheetPointerEnd}
      >
        {/* Sheet handle (mobile) — grab handle for swipe-to-close */}
        {isMobile && (
          <div
            data-sheet-grab
            style={{
              padding: '10px 0 4px',
              display: 'flex',
              justifyContent: 'center',
              cursor: 'grab',
              touchAction: 'none',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)' }} />
          </div>
        )}
        {isMobile && (
          <div
            data-sheet-grab
            style={{
              padding: '8px 16px 0',
              fontSize: 15,
              fontWeight: 600,
              color: '#f0f2f8',
              cursor: 'grab',
            }}
          >
            Switch site
          </div>
        )}

        <SitePickerContent
          sites={sites}
          currentSlug={currentSlug}
          loading={loading}
          onSelect={onSelect}
          autoFocusInput
          inputRef={inputRef}
          query={query}
          setQuery={setQuery}
          recent={recent}
          all={all}
          padded={isMobile}
        />
      </div>
    </>
  )
}

/** Inner content of SitePicker (search bar + recent + list).
 *  Extracted so the desktop sidebar can render the picker as a tab
 *  panel without the popover wrapper / backdrop / animation. */
export function SitePickerContent({
  sites,
  currentSlug,
  loading,
  onSelect,
  autoFocusInput = false,
  inputRef: externalInputRef,
  query: externalQuery,
  setQuery: externalSetQuery,
  recent: externalRecent,
  all: externalAll,
  padded = false,
}: {
  sites: SiteEntry[]
  currentSlug: string | null
  loading?: boolean
  onSelect: (slug: string) => void
  autoFocusInput?: boolean
  /** When the parent already maintains query state (e.g. SitePicker
   *  popover wrapper), pass it down so we don't double-bookkeep. */
  inputRef?: React.RefObject<HTMLInputElement | null>
  query?: string
  setQuery?: (q: string) => void
  recent?: SiteEntry[]
  all?: SiteEntry[]
  /** Add horizontal padding (used by mobile sheet); sidebar mode is
   *  flush. */
  padded?: boolean
}) {
  const localInputRef = useRef<HTMLInputElement | null>(null)
  const inputRef = externalInputRef ?? localInputRef
  const [localQuery, setLocalQuery] = useState('')
  const query = externalQuery ?? localQuery
  const setQuery = externalSetQuery ?? setLocalQuery

  const recentSlugs = useMemo<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    } catch {
      return []
    }
  }, [])

  const computed = useMemo(() => {
    if (externalRecent !== undefined && externalAll !== undefined) {
      return { recent: externalRecent, all: externalAll }
    }
    const q = query.toLowerCase().trim()
    const matches = (s: SiteEntry) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    const visible = sites.filter(matches)
    if (q) return { recent: [], all: visible }
    const recentSet = new Set(recentSlugs)
    const recent = recentSlugs
      .map((slug) => visible.find((s) => s.slug === slug))
      .filter((x): x is SiteEntry => Boolean(x) && x!.slug !== currentSlug)
    const all = visible.filter((s) => !recentSet.has(s.slug))
    return { recent, all }
  }, [externalRecent, externalAll, sites, query, recentSlugs, currentSlug])

  useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus()
  }, [autoFocusInput, inputRef])

  return (
    <>
      <div
        style={{
          padding: padded ? '8px 16px 12px' : '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 9,
          }}
        >
          <Search size={14} color="rgba(240,242,248,0.35)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 13,
              minWidth: 0,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(240,242,248,0.4)',
                cursor: 'pointer',
                lineHeight: 0,
                padding: 0,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          padding: padded ? '6px 6px 8px' : '6px 6px 8px',
        }}
      >
        {loading && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'rgba(240,242,248,0.4)',
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        )}
        {!loading && computed.recent.length > 0 && (
          <Section label="Recent">
            {computed.recent.map((s) => (
              <SiteRow
                key={s.slug}
                site={s}
                isCurrent={s.slug === currentSlug}
                onSelect={() => onSelect(s.slug)}
              />
            ))}
          </Section>
        )}
        {!loading && computed.all.length > 0 && (
          <Section label={query ? 'Results' : 'All sites'}>
            {computed.all.map((s) => (
              <SiteRow
                key={s.slug}
                site={s}
                isCurrent={s.slug === currentSlug}
                onSelect={() => onSelect(s.slug)}
              />
            ))}
          </Section>
        )}
        {!loading && computed.recent.length === 0 && computed.all.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'rgba(240,242,248,0.4)',
              fontSize: 13,
            }}
          >
            {query ? `No results for "${query}"` : 'No sites available'}
          </div>
        )}
      </div>
    </>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div
        style={{
          padding: '4px 10px',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.4)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function SiteRow({
  site,
  isCurrent,
  onSelect,
}: {
  site: SiteEntry
  isCurrent: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        background: isCurrent ? 'rgba(36,83,255,0.10)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        color: '#f0f2f8',
        fontSize: 13,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        if (!isCurrent) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${site.primary_color ?? '#2453ff'}, #a78bfa)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {site.name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {site.name}
          {isCurrent && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                color: '#9bb3ff',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}
            >
              Current
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(240,242,248,0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 1,
          }}
        >
          <code style={{ fontFamily: 'monospace' }}>{site.slug}</code>
          {typeof site.layer_count === 'number' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              · <Layers size={9} /> {site.layer_count}
            </span>
          )}
          {site.is_public_pre_login !== undefined && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              ·{' '}
              {site.is_public_pre_login ? (
                <>
                  <Globe size={9} color="#34d399" /> Public
                </>
              ) : (
                <>
                  <Lock size={9} /> Private
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
