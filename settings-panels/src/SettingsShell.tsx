import { useEffect, useState } from 'react'
import styles from './SettingsShell.module.css'
import { BasemapTerrainPanel } from './panels/BasemapTerrainPanel'
import { UnitsPanel } from './panels/UnitsPanel'
import { WidgetHostPanel } from './panels/WidgetHostPanel'
import { ThemePanel } from './panels/ThemePanel'
import { DeveloperPanel } from './panels/DeveloperPanel'

type SectionId = 'basemap' | 'units' | 'widgets' | 'theme' | 'dev'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'basemap', label: 'Basemap & terrain' },
  { id: 'units', label: 'Units' },
  { id: 'widgets', label: 'Widget host' },
  { id: 'theme', label: 'Theme & density' },
  { id: 'dev', label: 'Developer' },
]

/** Full-page Settings view. Left nav of sections, content panel on right.
 *  Reads the initial section from the URL hash (`#basemap`, `#units`, etc.). */
export function SettingsShell() {
  const [active, setActive] = useState<SectionId>(() => parseHash() ?? 'basemap')

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash()
      if (parsed) setActive(parsed)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const selectSection = (id: SectionId) => {
    setActive(id)
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${id}`)
    }
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <h3 className={styles.navTitle}>Settings</h3>
        {SECTIONS.map((s) => (
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

      <div className={styles.content}>
        {active === 'basemap' && <BasemapTerrainPanel />}
        {active === 'units' && <UnitsPanel />}
        {active === 'widgets' && <WidgetHostPanel />}
        {active === 'theme' && <ThemePanel />}
        {active === 'dev' && <DeveloperPanel />}
      </div>
    </div>
  )
}

function parseHash(): SectionId | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  if (h === 'basemap' || h === 'units' || h === 'widgets' || h === 'theme' || h === 'dev')
    return h
  return null
}
