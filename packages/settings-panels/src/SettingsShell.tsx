import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import styles from './SettingsShell.module.css'
import { BasemapTerrainPanel } from './panels/BasemapTerrainPanel'
import { UnitsPanel } from './panels/UnitsPanel'
import { WidgetHostPanel } from './panels/WidgetHostPanel'
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
  { id: 'basemap', label: 'Basemap & terrain', icon: svg('<polygon points="3 7 9 4 15 7 21 4 21 17 15 20 9 17 3 20 3 7"/><line x1="9" y1="4" x2="9" y2="17"/><line x1="15" y1="7" x2="15" y2="20"/>'), panel: <BasemapTerrainPanel /> },
  { id: 'units', label: 'Units', icon: svg('<path d="M3 7v10"/><path d="M3 12h18"/><path d="M21 7v10"/><path d="M7 9v6"/><path d="M11 8v8"/><path d="M15 9v6"/>'), panel: <UnitsPanel /> },
  { id: 'widgets', label: 'Widget host', icon: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'), panel: <WidgetHostPanel /> },
  { id: 'theme', label: 'Theme & density', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/><circle cx="8.5" cy="9.5" r="1"/><circle cx="15.5" cy="9.5" r="1"/><circle cx="8.5" cy="14.5" r="1"/>'), panel: <ThemePanel /> },
  { id: 'dev', label: 'Developer', icon: svg('<path d="M14.7 6.3a3 3 0 0 1 0 4.2l-1.5 1.5 4.2 4.2-2.1 2.1-4.2-4.2-1.5 1.5a3 3 0 0 1-4.2 0L3.5 13.5a3 3 0 0 1 0-4.2l4.2-4.2a3 3 0 0 1 4.2 0z"/>'), panel: <DeveloperPanel /> },
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
/** Detect phone breakpoint without depending on the host shell: native
 *  matchMedia for real devices, plus a `?forceBreakpoint=phone` URL
 *  check so AppShell's preview mode flips the layout too. */
function detectPhone(): boolean {
  if (typeof window === 'undefined') return false
  const forced = new URLSearchParams(window.location.search).get('forceBreakpoint')
  if (forced === 'phone' || forced === 'tablet' || forced === 'desktop') {
    return forced === 'phone'
  }
  return window.matchMedia('(max-width: 767px)').matches
}

export function SettingsShell({ extraSections = [] }: SettingsShellProps) {
  const allSections = [...BUILTIN_SECTIONS, ...extraSections]
  const validIds = new Set(allSections.map((s) => s.id))

  const [active, setActive] = useState<string>(() => {
    const h = parseHash()
    return h && validIds.has(h) ? h : 'basemap'
  })

  const [isPhone, setIsPhone] = useState<boolean>(detectPhone)

  useEffect(() => {
    const onHashChange = () => {
      const h = parseHash()
      if (h && validIds.has(h)) setActive(h)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [validIds])

  useEffect(() => {
    const update = () => setIsPhone(detectPhone())
    const mq = window.matchMedia('(max-width: 767px)')
    mq.addEventListener('change', update)
    // AppShell rewrites the `forceBreakpoint` URL via history.replaceState
    // (no popstate fires); poll cheaply so preview-mode toggles flip
    // the layout without a page reload.
    const id = window.setInterval(update, 500)
    return () => {
      mq.removeEventListener('change', update)
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
  const navEl = (
    <nav className={styles.nav}>
      <h3 className={styles.navTitle}>Settings</h3>
      {allSections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`${styles.navItem} ${s.id === active ? styles.navItemActive : ''}`}
          onClick={() => selectSection(s.id)}
        >
          {/* Icon only rendered on phone (CSS hides it on desktop) so
              the desktop left-rail layout stays text-only. */}
          {s.icon && <span className={styles.navItemIcon}>{s.icon}</span>}
          <span className={styles.navItemLabel}>{s.label}</span>
        </button>
      ))}
    </nav>
  )
  const contentEl = <div className={styles.content}>{activeSection?.panel}</div>

  return (
    <div className={`${styles.shell} ${isPhone ? styles.isPhone : ''}`}>
      {isPhone ? <>{contentEl}{navEl}</> : <>{navEl}{contentEl}</>}
    </div>
  )
}

function parseHash(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  return h || null
}
