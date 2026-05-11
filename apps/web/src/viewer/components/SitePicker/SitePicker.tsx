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

  // Mobile mount/unmount animation. The panel drops in from under the
  // top bar (the site chip the user tapped) instead of taking over the
  // bottom of the screen — which previously hid most of the map and
  // got auto-zoomed by Safari when the user focused the search input.
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!isMobile) return
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [isMobile])

  const beginClose = () => {
    if (!isMobile) return onClose()
    setClosing(true)
    window.setTimeout(onClose, 180)
  }

  // Auto-focus search; close on Esc or outside click.
  useEffect(() => {
    // On mobile we intentionally do NOT auto-focus — focusing brings up
    // the soft keyboard immediately, which feels heavy when the user
    // just wants to scan the list. They can tap the search field to
    // open the keyboard themselves.
    if (!isMobile) inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose()
    }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        beginClose()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, isMobile])

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
        // Phone — top-anchored card that drops down from under the
        // site chip the user tapped. Replaces the old bottom sheet,
        // which hid most of the map and was the only spot iOS Safari
        // could auto-zoom on the search input.
        position: 'fixed',
        top: 56,
        left: 10,
        right: 10,
        maxHeight: 'calc(100dvh - 76px)',
        background: 'rgba(13,14,20,0.98)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: closing || !mounted ? 0 : 1,
        transform: closing || !mounted ? 'translateY(-8px)' : 'translateY(0)',
        transition:
          'opacity 180ms cubic-bezier(0.22,1,0.36,1), transform 180ms cubic-bezier(0.22,1,0.36,1)',
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

      {/* Backdrop (mobile only) — dims the map enough to focus the
          dropdown card; tap to dismiss. */}
      {isMobile && (
        <div
          onClick={beginClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 59,
            opacity: closing || !mounted ? 0 : 1,
            transition: 'opacity 180ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      )}

      <div ref={containerRef} style={containerStyle}>
        {isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px 4px',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: '#f0f2f8' }}>
              Switch site
            </span>
            <button
              type="button"
              onClick={beginClose}
              aria-label="Close site picker"
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                color: 'rgba(240,242,248,0.55)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <SitePickerContent
          sites={sites}
          currentSlug={currentSlug}
          loading={loading}
          onSelect={onSelect}
          autoFocusInput={!isMobile}
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
            // 16px keeps iOS Safari from zooming the viewport on focus.
            // The visual size feels fine because the field sits in a
            // larger 9px-radius pill, not next to dense desktop text.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 16,
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
