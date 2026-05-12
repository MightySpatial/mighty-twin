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
}

const BUILTIN_SECTIONS: Section[] = [
  { id: 'basemap', label: 'Basemap & terrain', panel: <BasemapTerrainPanel /> },
  { id: 'units', label: 'Units', panel: <UnitsPanel /> },
  { id: 'widgets', label: 'Widget host', panel: <WidgetHostPanel /> },
  { id: 'theme', label: 'Theme & density', panel: <ThemePanel /> },
  { id: 'dev', label: 'Developer', panel: <DeveloperPanel /> },
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
          {s.label}
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
