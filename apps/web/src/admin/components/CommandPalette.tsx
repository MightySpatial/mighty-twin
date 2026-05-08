/** Atlas command palette — ⌘K / Ctrl+K to open.
 *
 *  Fast jump-to anywhere in the workspace: sites, story maps, snaps,
 *  data sources, plus one-click links to the Atlas top-level pages.
 *  Substring match, no ranking — keeps the surface predictable.
 *
 *  Mounted at the AdminRoot level so the hotkey only fires inside
 *  /admin/*. A cmd-K from /viewer doesn't open the palette since the
 *  destinations are all admin pages.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Camera,
  Database,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  Loader,
  MapPin,
  Radio,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Upload,
  X,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

type IconCmp = React.ComponentType<{ size?: number | string }>

interface PaletteItem {
  id: string
  label: string
  group: string
  hint?: string
  icon: IconCmp
  to: string
}

// Static list of admin destinations — always visible at the bottom of
// the palette as fallbacks even with no matches.
const PAGES: PaletteItem[] = [
  { id: 'page:overview', label: 'Overview', group: 'Pages', icon: LayoutDashboard, to: '/admin/overview' },
  { id: 'page:sites', label: 'Sites', group: 'Pages', icon: MapPin, to: '/admin/sites' },
  { id: 'page:data', label: 'Data sources', group: 'Pages', icon: Database, to: '/admin/data' },
  { id: 'page:feeds', label: 'Feeds', group: 'Pages', icon: Radio, to: '/admin/feeds' },
  { id: 'page:library', label: 'Library', group: 'Pages', icon: FolderOpen, to: '/admin/library' },
  { id: 'page:stories', label: 'Stories', group: 'Pages', icon: BookOpen, to: '/admin/stories' },
  { id: 'page:snapshots', label: 'Snaps', group: 'Pages', icon: Camera, to: '/admin/snapshots' },
  { id: 'page:submissions', label: 'Submissions', group: 'Pages', icon: Inbox, to: '/admin/submissions' },
  { id: 'page:upload', label: 'Upload', group: 'Pages', icon: Upload, to: '/admin/upload' },
  { id: 'page:settings', label: 'Settings', group: 'Pages', icon: SettingsIcon, to: '/settings' },
]

export default function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Global hotkey: ⌘K (mac) / Ctrl+K (other). Don't fire while in a text input
  // unless the modifier is held — typing K in a textarea shouldn't open it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Fetch the catalog on first open. Refetch every open is overkill;
  // the palette is most useful for quick visits and the data is
  // ephemeral, so once-per-mount is enough.
  useEffect(() => {
    if (!open || items.length > 0) {
      if (open) {
        setQuery('')
        setActiveIdx(0)
        // Focus on next paint so the autoFocus reset takes effect
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      return
    }
    setLoading(true)
    Promise.allSettled([
      apiFetch('/api/spatial/sites') as Promise<
        { id: string; slug: string; name: string }[]
      >,
      apiFetch('/api/story-maps') as Promise<
        { id: string; name: string; site_id: string }[]
      >,
      apiFetch('/api/spatial/data-sources') as Promise<
        { id: string; name: string; type: string }[]
      >,
      apiFetch('/me/snapshots') as Promise<
        { id: string; name: string; site_slug: string | null }[]
      >,
      apiFetch('/api/feeds') as Promise<
        { id: string; name: string; kind: string }[]
      >,
    ])
      .then(([sites, stories, dss, snaps, feeds]) => {
        const out: PaletteItem[] = []
        if (sites.status === 'fulfilled') {
          for (const s of sites.value) {
            out.push({
              id: `site:${s.id}`,
              label: s.name,
              group: 'Sites',
              hint: s.slug,
              icon: MapPin,
              to: `/admin/sites/${s.slug}`,
            })
          }
        }
        if (stories.status === 'fulfilled') {
          for (const s of stories.value) {
            out.push({
              id: `story:${s.id}`,
              label: s.name,
              group: 'Story maps',
              icon: BookOpen,
              to: '/admin/stories',
            })
          }
        }
        if (dss.status === 'fulfilled') {
          for (const d of dss.value) {
            out.push({
              id: `data:${d.id}`,
              label: d.name,
              group: 'Data sources',
              hint: d.type,
              icon: Database,
              to: `/admin/data/${d.id}`,
            })
          }
        }
        if (snaps.status === 'fulfilled') {
          for (const s of snaps.value) {
            out.push({
              id: `snap:${s.id}`,
              label: s.name,
              group: 'Snaps',
              icon: Camera,
              to: '/admin/snapshots',
            })
          }
        }
        if (feeds.status === 'fulfilled') {
          for (const f of feeds.value) {
            out.push({
              id: `feed:${f.id}`,
              label: f.name,
              group: 'Feeds',
              hint: f.kind,
              icon: Radio,
              to: '/admin/feeds',
            })
          }
        }
        setItems(out)
      })
      .finally(() => setLoading(false))
  }, [open, items.length])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...items, ...PAGES]
    if (!q) return all
    return all.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.hint && i.hint.toLowerCase().includes(q)),
    )
  }, [items, query])

  // Group by .group while preserving the input order (so Pages stays
  // last when no query, and result order isn't shuffled per keystroke).
  const grouped = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, PaletteItem[]>()
    for (const f of filtered) {
      if (!map.has(f.group)) {
        order.push(f.group)
        map.set(f.group, [])
      }
      map.get(f.group)!.push(f)
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }))
  }, [filtered])

  // Flat list of items in render order — used for keyboard nav.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  function pick(i: PaletteItem) {
    setOpen(false)
    navigate(i.to)
  }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'min(15vh, 120px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '70vh',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <SearchIcon size={16} color="rgba(240,242,248,0.45)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx((i) => Math.min(flat.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (flat[activeIdx]) pick(flat[activeIdx])
              }
            }}
            placeholder="Jump to a site, story, snap, page…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 14,
            }}
          />
          {loading && <Loader size={14} className="spin" />}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.45)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 8,
          }}
        >
          {flat.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'rgba(240,242,248,0.4)',
                fontSize: 13,
              }}
            >
              {loading ? 'Loading…' : 'No matches.'}
            </div>
          ) : (
            grouped.map(({ group, items }) => {
              const startIdx = flat.indexOf(items[0])
              return (
                <div key={group} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      padding: '6px 10px 4px',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'rgba(240,242,248,0.4)',
                    }}
                  >
                    {group}
                  </div>
                  {items.map((it, idx) => {
                    const flatIdx = startIdx + idx
                    const Icon = it.icon
                    const active = flatIdx === activeIdx
                    return (
                      <button
                        key={it.id}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        onClick={() => pick(it)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          background: active ? 'rgba(36,83,255,0.18)' : 'transparent',
                          border: 'none',
                          borderRadius: 7,
                          color: '#f0f2f8',
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <Icon size={14} />
                        <span style={{ flex: 1 }}>{it.label}</span>
                        {it.hint && (
                          <code
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: 'rgba(240,242,248,0.45)',
                            }}
                          >
                            {it.hint}
                          </code>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '8px 14px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: 'rgba(240,242,248,0.45)',
          }}
        >
          <span>
            <Kbd>↵</Kbd> open
          </span>
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> nav
          </span>
          <span>
            <Kbd>esc</Kbd> close
          </span>
          <span style={{ flex: 1 }} />
          <span>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        margin: '0 2px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </kbd>
  )
}
