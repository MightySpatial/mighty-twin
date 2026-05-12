/** FloatingSidePanel — "secondary sidebar" half of the
 *  primary+secondary side bar pattern. A 300px panel docked to the
 *  right edge of the FloatingIconStack on desktop / tablet-landscape,
 *  rendered as a bottom sheet on phone / tablet-portrait.
 *
 *  Only one panel is mounted at a time; the host owns
 *  `activePanel: string | null` and swaps content as a different icon
 *  is tapped. ESC closes (handled here via window listener). */

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './FloatingSidePanel.module.css'

export interface FloatingSidePanelProps {
  /** Panel id — corresponds to the FloatingIconStack icon that opens it. */
  id: string
  /** Title shown in the header. */
  title: string
  /** Icon component (Lucide) shown alongside the title. */
  icon?: ReactNode
  /** When true, renders as a bottom sheet (phone, tablet portrait).
   *  When false, renders as a 300px side panel (desktop, tablet landscape). */
  asSheet?: boolean
  /** Close handler — called on the X button, ESC, or backdrop click
   *  (sheet mode only). */
  onClose: () => void
  /** Optional sticky footer slot — e.g. "+ Add layer" button. */
  footer?: ReactNode
  children?: ReactNode
}

export function FloatingSidePanel({
  id,
  title,
  icon,
  asSheet = false,
  onClose,
  footer,
  children,
}: FloatingSidePanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const body = (
    <div
      className={asSheet ? styles.sheet : styles.panel}
      role="dialog"
      aria-label={title}
      data-panel-id={id}
    >
      {asSheet && <div className={styles.sheetHandle} aria-hidden />}
      <header className={styles.header}>
        <span className={styles.title}>
          {icon && <span className={styles.titleIcon}>{icon}</span>}
          {title}
        </span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close panel"
        >
          <X size={asSheet ? 14 : 12} />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )

  if (asSheet) {
    return (
      <div className={styles.sheetBackdrop} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>{body}</div>
      </div>
    )
  }
  return body
}

export default FloatingSidePanel
