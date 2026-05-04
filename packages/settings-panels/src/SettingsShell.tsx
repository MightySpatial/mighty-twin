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
export function SettingsShell({ extraSections = [] }: SettingsShellProps) {
  const allSections = [...BUILTIN_SECTIONS, ...extraSections]
  const validIds = new Set(allSections.map((s) => s.id))

  const [active, setActive] = useState<string>(() => {
    const h = parseHash()
    return h && validIds.has(h) ? h : 'basemap'
  })

  useEffect(() => {
    const onHashChange = () => {
      const h = parseHash()
      if (h && validIds.has(h)) setActive(h)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [validIds])

  const selectSection = (id: string) => {
    setActive(id)
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${id}`)
    }
  }

  const activeSection = allSections.find((s) => s.id === active)

  return (
    <div className={styles.shell}>
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

      <div className={styles.content}>{activeSection?.panel}</div>
    </div>
  )
}

function parseHash(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  return h || null
}
