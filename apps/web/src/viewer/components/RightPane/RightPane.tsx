/**
 * RightPane — right-side slot for the active secondary widget.
 *
 * Desktop (mode='docked'):
 *   320px-wide fixed pane always present; caller offsets canvas.
 *
 * Mobile (mode='drawer'):
 *   85vw drawer that slides in/out from the right edge. Hidden when
 *   `body` is null. The host opens it (sidebar widget tab click) and
 *   closes it via the × button or the backdrop. Fly mode on mobile
 *   forces it shut so the touch surface is unobstructed.
 *
 *   ┌────────────────────────┐
 *   │ ACTIVE WIDGET NAME · × │  header — 32px (×-button only in drawer)
 *   ├────────────────────────┤
 *   │  active widget body    │
 *   │                        │
 *   ├────────────────────────┤
 *   │  Fly                   │  bottom zone — fixed ~140px
 *   └────────────────────────┘
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './RightPane.module.css'

export interface RightPaneProps {
  /** Optional label for the slim header — usually the active widget's
   *  name (e.g. "Design"). When null the header is hidden. */
  bodyLabel?: string | null
  /** Active widget body. null = empty hint shown instead. */
  body: ReactNode | null
  /** Optional bottom-zone content. Renders in a fixed-height slot
   *  below the body when provided; omit to give the body the full
   *  pane height. */
  bottomZone?: ReactNode
  /** Optional max width override. Defaults to 320px on desktop, ignored
   *  on mobile (drawer uses 85vw). */
  width?: number
  /** Layout mode. Defaults to 'docked' (desktop). 'drawer' = mobile
   *  slide-in from the right edge. */
  mode?: 'docked' | 'drawer'
  /** Drawer-only: whether the drawer is currently visible. The host
   *  controls this so multiple paths (sidebar tab click, fly-mode
   *  auto-hide) can converge on one source of truth. */
  drawerOpen?: boolean
  /** Drawer-only: called when the user dismisses the drawer
   *  (× button, backdrop tap, or Escape). */
  onDrawerClose?: () => void
}

export default function RightPane({
  bodyLabel = null,
  body,
  bottomZone,
  width = 320,
  mode = 'docked',
  drawerOpen = false,
  onDrawerClose,
}: RightPaneProps) {
  const isDrawer = mode === 'drawer'

  // Drawer: ESC closes. Mirrors the standard sheet/modal pattern so
  // users on a tablet with a keyboard get the expected behaviour.
  useEffect(() => {
    if (!isDrawer || !drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDrawerClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDrawer, drawerOpen, onDrawerClose])

  if (isDrawer) {
    const visible = drawerOpen && body !== null
    return (
      <>
        {visible && (
          <div
            className={styles.drawerBackdrop}
            onClick={onDrawerClose}
            aria-hidden
          />
        )}
        <aside
          className={`${styles.pane} ${styles.drawer}${visible ? ' ' + styles.drawerOpen : ''}`}
          role="dialog"
          aria-modal={visible}
          aria-label="Widget drawer"
          aria-hidden={!visible}
        >
          <div className={styles.header}>
            <span className={styles.headerLabel}>{bodyLabel ?? 'Widget'}</span>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={onDrawerClose}
              aria-label="Close drawer"
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.content}>
            {body}
          </div>
          {bottomZone && <div className={styles.bottomZone}>{bottomZone}</div>}
        </aside>
      </>
    )
  }

  // Docked (desktop)
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
            <p>Pick a widget from the rail below.</p>
          </div>
        )}
      </div>

      {bottomZone && <div className={styles.bottomZone}>{bottomZone}</div>}
    </aside>
  )
}
