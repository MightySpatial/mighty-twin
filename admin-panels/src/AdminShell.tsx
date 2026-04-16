import type { ReactNode } from 'react'
import styles from './AdminShell.module.css'

export interface AdminSection {
  id: string
  label: string
  content: ReactNode
}

interface AdminShellProps {
  title: string
  subtitle?: string
  sections: AdminSection[]
  activeSectionId: string
  onActiveSectionChange: (id: string) => void
}

/** Shared chrome used by both dev-tools and mock-admin variants. */
export function AdminShell({
  title,
  subtitle,
  sections,
  activeSectionId,
  onActiveSectionChange,
}: AdminShellProps) {
  const active = sections.find((s) => s.id === activeSectionId) ?? sections[0]

  return (
    <div className={styles.adminShell}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <nav className={styles.navRail} role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === activeSectionId}
            className={`${styles.navItem} ${s.id === activeSectionId ? styles.navItemActive : ''}`}
            onClick={() => onActiveSectionChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>{active?.content}</div>
    </div>
  )
}
