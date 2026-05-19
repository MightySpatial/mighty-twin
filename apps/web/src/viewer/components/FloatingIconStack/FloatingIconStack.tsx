/** FloatingIconStack — VSCode-style "primary sidebar" for the Map pane.
 *
 *  A vertical column of icon buttons on the left edge of the map.
 *  Each icon either opens a `FloatingSidePanel` (Layers / Site info /
 *  Terrain / Search / Legend) or toggles a tool mode (Measure). Same
 *  component renders identically on phone, tablet, and desktop —
 *  positioning is constant; on phone the corresponding panel renders
 *  as a bottom sheet, on desktop as a 300px side panel.
 *
 *  Active state: when the icon's panel ID equals `activePanel` OR
 *  when the icon's `isActive` prop is true (e.g. Measure mode). */

import type { ReactNode, RefObject } from 'react'
import styles from './FloatingIconStack.module.css'

export interface FloatingIconStackItem {
  id: string
  label: string
  icon: ReactNode
  /** When true, the icon highlights regardless of activePanel.
   *  Used by tool-toggles (Measure) that don't open a panel. */
  isActive?: boolean
  /** When true, clicking the icon toggles the panel matching `id`.
   *  When false, the icon is a pure tool toggle (Measure). */
  hasPanel?: boolean
  /** Override the default click behaviour (panel toggle). Used by
   *  Measure to engage the measure tool instead. */
  onClick?: () => void
  /** Optional ref the host can pass in to grab the button element.
   *  Used by drag-to-activate widgets (Probe, Street View) so the
   *  drag glyph can be summoned from this tile via pointerdown. */
  tileRef?: RefObject<HTMLButtonElement>
}

export interface FloatingIconStackProps {
  items: FloatingIconStackItem[]
  /** Currently-active panel id (null = no panel open). */
  activePanel: string | null
  /** Open / close handler called when an icon with `hasPanel: true`
   *  is clicked. The host owns activePanel state. */
  onTogglePanel: (id: string) => void
}

export function FloatingIconStack({
  items,
  activePanel,
  onTogglePanel,
}: FloatingIconStackProps) {
  return (
    <div className={styles.stack}>
      {items.map((item) => {
        const active = item.isActive || activePanel === item.id
        return (
          <button
            key={item.id}
            ref={item.tileRef}
            type="button"
            className={`${styles.icon} ${active ? styles.iconActive : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => {
              if (item.onClick) item.onClick()
              else if (item.hasPanel ?? true) onTogglePanel(item.id)
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}

export default FloatingIconStack
