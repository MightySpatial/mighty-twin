import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import styles from './SettingsShell.module.css'
import { BasemapTerrainPanel } from './panels/BasemapTerrainPanel'
import { UnitsPanel } from './panels/UnitsPanel'
import { WidgetHostPanel } from './panels/WidgetHostPanel'
import { GooglePanel } from './panels/GooglePanel'
import { ProbePanel } from './panels/ProbePanel'
import { ThemePanel } from './panels/ThemePanel'
import { DeveloperPanel } from './panels/DeveloperPanel'

interface Section {
  id: string
  label: string
  panel: ReactNode
  /** Optional 20×20 icon node — shown above the label in the phone
   *  bottom carousel, hidden on desktop. Pass anything ReactNode
   *  (Lucide, inline SVG, whatever) — keeps the package independent
   *  of any specific icon library. */
  icon?: ReactNode
  /** Section group — sections sharing the same group cluster together
   *  in the nav with a heading above the first item. Sections without
   *  a group land at the top under "General". Renders on desktop sidebar
   *  only; phone bottom carousel still flattens. */
  group?: string
}

/** Inline SVG factory — keeps settings-panels free of a hard
 *  dependency on lucide-react or any icon lib. Each builtin uses a
 *  20×20 stroke-1.75 line icon to match the Lucide visual weight
 *  Twin uses throughout the rest of the app. */
const svg = (path: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g dangerouslySetInnerHTML={{ __html: path }} />
  </svg>
)

const BUILTIN_SECTIONS: Section[] = [
  { id: 'basemap', label: 'Basemap & terrain', group: 'Engine', icon: svg('<polygon points="3 7 9 4 15 7 21 4 21 17 15 20 9 17 3 20 3 7"/><line x1="9" y1="4" x2="9" y2="17"/><line x1="15" y1="7" x2="15" y2="20"/>'), panel: <BasemapTerrainPanel /> },
  { id: 'units', label: 'Units', group: 'Engine', icon: svg('<path d="M3 7v10"/><path d="M3 12h18"/><path d="M21 7v10"/><path d="M7 9v6"/><path d="M11 8v8"/><path d="M15 9v6"/>'), panel: <UnitsPanel /> },
  { id: 'widgets', label: 'Widget host', group: 'Engine', icon: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'), panel: <WidgetHostPanel /> },
  { id: 'theme', label: 'Theme & density', group: 'Engine', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/><circle cx="8.5" cy="9.5" r="1"/><circle cx="15.5" cy="9.5" r="1"/><circle cx="8.5" cy="14.5" r="1"/>'), panel: <ThemePanel /> },
  { id: 'google', label: 'Google', group: 'Engine', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'), panel: <GooglePanel /> },
  { id: 'probe', label: 'Probe', group: 'Engine', icon: svg('<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10" opacity="0.6"/>'), panel: <ProbePanel /> },
  { id: 'dev', label: 'Developer', group: 'Advanced', icon: svg('<path d="M14.7 6.3a3 3 0 0 1 0 4.2l-1.5 1.5 4.2 4.2-2.1 2.1-4.2-4.2-1.5 1.5a3 3 0 0 1-4.2 0L3.5 13.5a3 3 0 0 1 0-4.2l4.2-4.2a3 3 0 0 1 4.2 0z"/>'), panel: <DeveloperPanel /> },
]

export interface SettingsShellProps {
  /** App-specific sections injected after the built-in panels.
   *  Each entry needs a unique `id` (used for URL hash + key),
   *  a `label` for the sidebar, and the `panel` ReactNode to
   *  render when selected. */
  extraSections?: Section[]
}

/** Full-page Settings view. Left nav of sections, content panel on right.
 *  Reads the initial section from the URL hash (`#basemap`, `#units`, etc.).
 *  Consumer apps pass `extraSections` to add app-specific panels (e.g.
 *  Users, System Settings) without forking the shell. */
/** Detect whether the phone-style layout (bottom carousel) should be
 *  used. Returns true for real phones AND for tablet portrait — the
 *  orientation pivot in §5.3 of the implementation brief. Tablet
 *  landscape keeps the desktop sidebar.
 *
 *  Detection sources, in priority order:
 *    1. `?forceBreakpoint=` URL param (AppShell preview mode) +
 *       `?forceOrientation=` for tablet.
 *    2. Native matchMedia (max-width: 767px) for real phones.
 *    3. Aspect ratio at tablet widths (768–1023): portrait → phone
 *       layout, landscape → desktop layout. */
function detectPhoneLikeLayout(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const forcedBp = params.get('forceBreakpoint')
  if (forcedBp === 'phone') return true
  if (forcedBp === 'desktop') return false
  if (forcedBp === 'tablet') {
    const forcedOrient = params.get('forceOrientation')
    if (forcedOrient === 'portrait') return true
    if (forcedOrient === 'landscape') return false
  }
  if (window.matchMedia('(max-width: 767px)').matches) return true
  // Tablet portrait — width 768-1023 and portrait aspect ratio.
  const w = window.innerWidth
  const h = window.innerHeight
  if (w >= 768 && w < 1024 && h > w) return true
  return false
}

/** Stable group ordering for the sidebar — the renderer emits a header
 *  whenever the group changes between adjacent sections, so we sort by
 *  this order before rendering. Without this, two consecutive sections
 *  in different positions could produce the same group header twice. */
const GROUP_ORDER = ['Engine', 'Workspace', 'Account', 'Advanced']
function groupRank(group?: string): number {
  if (!group) return 999
  const i = GROUP_ORDER.indexOf(group)
  return i === -1 ? 998 : i
}

export function SettingsShell({ extraSections = [] }: SettingsShellProps) {
  const allSections = [...BUILTIN_SECTIONS, ...extraSections]
    .map((s, originalIndex) => ({ s, originalIndex }))
    .sort((a, b) => {
      // Sort by group first, then preserve original order within group.
      const rg = groupRank(a.s.group) - groupRank(b.s.group)
      if (rg !== 0) return rg
      return a.originalIndex - b.originalIndex
    })
    .map(({ s }) => s)
  const validIds = new Set(allSections.map((s) => s.id))

  const [active, setActive] = useState<string>(() => {
    const h = parseHash()
    return h && validIds.has(h) ? h : 'basemap'
  })

  const [isPhone, setIsPhone] = useState<boolean>(detectPhoneLikeLayout)

  useEffect(() => {
    const onHashChange = () => {
      const h = parseHash()
      if (h && validIds.has(h)) setActive(h)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [validIds])

  useEffect(() => {
    const update = () => setIsPhone(detectPhoneLikeLayout())
    const mq = window.matchMedia('(max-width: 767px)')
    mq.addEventListener('change', update)
    // Listen for orientation flips so tablet portrait <-> landscape
    // re-evaluates without a reload.
    window.addEventListener('orientationchange', update)
    window.addEventListener('resize', update)
    // AppShell rewrites the `forceBreakpoint` URL via history.replaceState
    // (no popstate fires); poll cheaply so preview-mode toggles flip
    // the layout without a page reload.
    const id = window.setInterval(update, 500)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('resize', update)
      window.clearInterval(id)
    }
  }, [])

  const selectSection = (id: string) => {
    setActive(id)
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${id}`)
    }
  }

  const activeSection = allSections.find((s) => s.id === active)

  // On phone, render content first then the carousel nav so the
  // grid-template-rows layout reflects DOM order (content top, nav at
  // the base). Desktop stays nav-then-content for the left-rail layout.
  // Render group headings between sections whose `group` value changes.
  // Sections without an explicit group share the implicit "" bucket and
  // get no heading above them (used for un-grouped consumer additions).
  let prevGroup: string | undefined = undefined

  const navEl = (
    <nav className={styles.nav}>
      <h3 className={styles.navTitle}>Settings</h3>
      {allSections.map((s) => {
        const showGroupHeader = s.group && s.group !== prevGroup
        prevGroup = s.group
        return (
          <span key={s.id} style={{ display: 'contents' }}>
            {showGroupHeader && (
              <h4 className={styles.navGroup}>{s.group}</h4>
            )}
            <button
              type="button"
              className={`${styles.navItem} ${s.id === active ? styles.navItemActive : ''}`}
              onClick={() => selectSection(s.id)}
            >
              {/* Icon only rendered on phone (CSS hides it on desktop) so
                  the desktop left-rail layout stays text-only. */}
              {s.icon && <span className={styles.navItemIcon}>{s.icon}</span>}
              <span className={styles.navItemLabel}>{s.label}</span>
            </button>
          </span>
        )
      })}
    </nav>
  )
  const contentEl = <div className={styles.content}>{activeSection?.panel}</div>

  return (
    <div className={`${styles.shell} ${isPhone ? styles.isPhone : ''}`}>
      {/* Phone: nav rendered AFTER content so flex order puts it at the
          bottom (same pattern as Atlas's bottom-nav). Desktop / tablet
          landscape keep nav-then-content for the left-rail sidebar.
          The double-bar-at-bottom is intentional and matches the Atlas
          UX — consistency beats vertical-pixel savings. */}
      {isPhone ? (
        <>
          {contentEl}
          {navEl}
        </>
      ) : (
        <>
          {navEl}
          {contentEl}
        </>
      )}
    </div>
  )
}

function parseHash(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  return h || null
}
