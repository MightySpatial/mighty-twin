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
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 60,
        left: 14,
        width: 340,
        maxHeight: 'calc(100vh - 100px)',
        background: 'rgba(15,15,20,0.96)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'spickerIn 160ms ease-out',
      }}
    >
      <style>{`
        @keyframes spickerIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          padding: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={14} color="rgba(240,242,248,0.4)" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Switch site…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f0f2f8',
            fontSize: 13,
          }}
        />
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
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 6 }}>
        {loading && (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              color: 'rgba(240,242,248,0.5)',
              fontSize: 12,
            }}
          >
            Loading sites…
          </div>
        )}
        {!loading && recent.length > 0 && (
          <Section label="Recent">
            {recent.map((s) => (
              <SiteRow
                key={s.slug}
                site={s}
                isCurrent={s.slug === currentSlug}
                onSelect={() => onSelect(s.slug)}
              />
            ))}
          </Section>
        )}
        {!loading && all.length > 0 && (
          <Section label={query ? 'Results' : 'All sites'}>
            {all.map((s) => (
              <SiteRow
                key={s.slug}
                site={s}
                isCurrent={s.slug === currentSlug}
                onSelect={() => onSelect(s.slug)}
              />
            ))}
          </Section>
        )}
        {!loading && recent.length === 0 && all.length === 0 && (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              color: 'rgba(240,242,248,0.5)',
              fontSize: 12,
            }}
          >
            {query ? 'No matches' : 'No sites available'}
          </div>
        )}
      </div>
    </div>
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
