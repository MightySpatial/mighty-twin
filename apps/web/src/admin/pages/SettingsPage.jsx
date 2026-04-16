import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { Bell, Shield, Key, Mail, Database, CreditCard, ChevronRight, Globe } from 'lucide-react'
import '../styles/components.css'
import './SettingsPage.css'

const SETTINGS_SECTIONS = [
  {
    title: 'Preferences',
    items: [
      { icon: Bell, label: 'Notifications', path: '/admin/settings/notifications' },
      { icon: Shield, label: 'Security', path: '/admin/settings/security' },
    ]
  },
  {
    title: 'System',
    items: [
      { icon: Globe, label: 'System Settings', path: '/admin/settings/system' },
      { icon: Key, label: 'API Keys', path: '/admin/settings/api-keys' },
      { icon: Mail, label: 'Email Configuration', path: '/admin/settings/email' },
      { icon: Database, label: 'Backup & Restore', path: '/admin/settings/backup' },
    ]
  },
  {
    title: 'Account',
    items: [
      { icon: CreditCard, label: 'Usage & Billing', path: '/admin/settings/billing' },
    ]
  },
]

export default function SettingsPage() {
  const { isDesktop } = useBreakpoint()
  const navigate = useNavigate()

  return (
    <div className="settings-page">
      {/* Desktop header */}
      {isDesktop && (
        <header className="page-header">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your application preferences</p>
        </header>
      )}

      <div className="settings-content">
        {SETTINGS_SECTIONS.map((section, i) => (
          <section key={i} className="section settings-section">
            <h2 className="section-title">{section.title}</h2>
            <div className="menu-list settings-menu">
              {section.items.map((item, j) => (
                <button key={j} className="menu-item" onClick={() => navigate(item.path)}>
                  <span className="menu-item-icon">
                    <item.icon size={20} />
                  </span>
                  <span className="menu-item-label">{item.label}</span>
                  <ChevronRight size={18} className="menu-item-chevron" />
                </button>
              ))}
            </div>
          </section>
        ))}

        <section className="section settings-section">
          <h2 className="section-title danger-title">Danger Zone</h2>
          <div className="danger-actions">
            <button className="btn btn-danger btn-full">Clear All Cache</button>
            <button className="btn btn-danger btn-full">Export All Data</button>
          </div>
        </section>
      </div>
    </div>
  )
}
