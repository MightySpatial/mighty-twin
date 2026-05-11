/**
 * RightPane — desktop right-side slot for the active secondary widget.
 *
 *   ┌────────────────────────┐
 *   │ Active widget name     │  subtle header — 32px (hidden when idle)
 *   ├────────────────────────┤
 *   │                        │  content slot — flex 1, scrolls
 *   │  active widget body    │
 *   │                        │
 *   ├────────────────────────┤
 *   │  Fly                   │  bottom zone — fixed ~140px
 *   └────────────────────────┘
 *
 * The pane is always present on desktop. It has NO controller of its
 * own — the caller decides which widget is active (Story / Snap /
 * Design / Terrain) by passing a non-null `body`. Activation buttons
 * live in the ViewerSidebar widget-tabs row.
 *
 * Spec: apps/web/public/dev/right-pane/index.html (concept mockup).
 */
import { type ReactNode } from 'react'
import styles from './RightPane.module.css'

export interface RightPaneProps {
  /** Optional label for the slim header — usually the active widget's
   *  name (e.g. "Design"). When null the header is hidden. */
  bodyLabel?: string | null
  /** Active widget body. null = empty hint shown instead. */
  body: ReactNode | null
  /** Bottom-zone content — Fly widget today. Rendered in a fixed-height
   *  slot below the body. */
  bottomZone: ReactNode
  /** Optional max width override. Defaults to 320px. */
  width?: number
}

export default function RightPane({
  bodyLabel = null,
  body,
  bottomZone,
  width = 320,
}: RightPaneProps) {
  return (
    <aside
      className={styles.pane}
      style={{ width }}
      role="complementary"
      aria-label="Widget pane"
    >
      {bodyLabel && body && (
        <div className={styles.header}>
          <span className={styles.headerLabel}>{bodyLabel}</span>
        </div>
      )}

      <div className={styles.content}>
        {body ?? (
          <div className={styles.empty}>
            <p>Pick a widget from the sidebar.</p>
          </div>
        )}
      </div>

      <div className={styles.bottomZone}>{bottomZone}</div>
    </aside>
  )
}
