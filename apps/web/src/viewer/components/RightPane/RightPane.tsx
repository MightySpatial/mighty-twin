/**
 * RightPane — replaces the bottom secondary rail.
 *
 *   ┌────────────────────────┐
 *   │ Story Snap Design …    │  tab bar — top, 40px
 *   ├────────────────────────┤
 *   │                        │  content slot — flex 1, scrolls
 *   │  active widget body    │
 *   │                        │
 *   ├────────────────────────┤
 *   │  Fly                   │  bottom zone — fixed ~140px
 *   └────────────────────────┘
 *
 * The pane is always present on desktop. It owns its own width
 * (320px) and the caller offsets the canvas / left chrome accordingly.
 *
 * Widget bodies are passed as `tabContent` slots — the host
 * (CesiumViewer) decides what to render for each tab. The pane only
 * handles tab switching and zone composition.
 *
 * Spec: apps/web/public/dev/right-pane/index.html (concept mockup).
 */
import { useMemo, type ReactNode } from 'react'
import {
  BookOpen,
  Camera,
  Hexagon,
  Mountain,
  Slash,
  type LucideIcon,
} from 'lucide-react'
import styles from './RightPane.module.css'

export type RightPaneTabId = 'story' | 'snap' | 'design' | 'strike' | 'terrain'

interface TabDef {
  id: RightPaneTabId
  label: string
  Icon: LucideIcon
}

const TABS: TabDef[] = [
  { id: 'story',   label: 'Story',   Icon: BookOpen },
  { id: 'snap',    label: 'Snap',    Icon: Camera   },
  { id: 'design',  label: 'Design',  Icon: Hexagon  },
  { id: 'strike',  label: 'Strike',  Icon: Slash    },
  { id: 'terrain', label: 'Terrain', Icon: Mountain },
]

export interface RightPaneProps {
  /** Active tab — null = no widget content shown (an empty hint is
   *  rendered instead). The host owns this state so multiple paths
   *  into the pane (rail buttons, deep links, keyboard) all converge. */
  activeTab: RightPaneTabId | null
  onTabChange: (next: RightPaneTabId) => void
  /** Body for each tab. Missing keys render the empty hint. */
  tabContent: Partial<Record<RightPaneTabId, ReactNode>>
  /** Bottom-zone content — Fly widget today. Rendered in a fixed-height
   *  slot below the tab content area. */
  bottomZone: ReactNode
  /** Optional max width override. Defaults to 320px. */
  width?: number
}

export default function RightPane({
  activeTab,
  onTabChange,
  tabContent,
  bottomZone,
  width = 320,
}: RightPaneProps) {
  // Memoise the body so React doesn't unmount + remount the active
  // widget when the host re-renders for unrelated reasons.
  const body = useMemo(() => {
    if (!activeTab) {
      return (
        <div className={styles.empty}>
          <p>Pick a tab above.</p>
        </div>
      )
    }
    return tabContent[activeTab] ?? (
      <div className={styles.empty}>
        <p>{TABS.find(t => t.id === activeTab)?.label} not yet wired.</p>
      </div>
    )
  }, [activeTab, tabContent])

  return (
    <aside
      className={styles.pane}
      style={{ width }}
      role="complementary"
      aria-label="Widget pane"
    >
      <div className={styles.tabs} role="tablist" aria-label="Widget tabs">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab}${isActive ? ` ${styles.tabActive}` : ''}`}
              onClick={() => onTabChange(id)}
            >
              <Icon size={14} aria-hidden />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.content}>{body}</div>

      <div className={styles.bottomZone}>{bottomZone}</div>
    </aside>
  )
}
