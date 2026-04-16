import { useState, useEffect } from 'react'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { apiFetch } from '../hooks/useApi'
import { 
  Search, Plus, ChevronRight, Check, X, RefreshCw, 
  Database, Users, Briefcase, Cloud, Bell, BarChart3,
  Wifi, Webhook, Settings, AlertCircle, CheckCircle, Loader
} from 'lucide-react'
import '../styles/components.css'
import './IntegrationsPage.css'

const CATEGORY_ICONS = {
  data_source: Database,
  asset_mgmt: Briefcase,
  work_orders: Briefcase,
  crm: Users,
  erp: Briefcase,
  storage: Cloud,
  auth: Users,
  notifications: Bell,
  bi: BarChart3,
  iot: Wifi,
  custom: Webhook,
}

const CATEGORY_LABELS = {
  data_source: 'Data Sources',
  asset_mgmt: 'Asset Management',
  work_orders: 'Work Orders',
  crm: 'CRM',
  erp: 'ERP',
  storage: 'Storage',
  auth: 'Authentication',
  notifications: 'Notifications',
  bi: 'BI & Analytics',
  iot: 'IoT',
  custom: 'Custom',
}

// Mock data - would come from API
const MOCK_CATALOG = [
  { id: 'arcgis-server', name: 'ArcGIS Server', category: 'data_source', description: 'Connect to ArcGIS Server map and feature services' },
  { id: 'wms', name: 'WMS Service', category: 'data_source', description: 'Connect to OGC Web Map Services' },
  { id: 'postgis', name: 'PostGIS Database', category: 'data_source', description: 'Direct connection to PostGIS spatial database' },
  { id: 'maximo', name: 'IBM Maximo', category: 'asset_mgmt', description: 'Sync assets and work orders with IBM Maximo' },
  { id: 'servicenow', name: 'ServiceNow', category: 'work_orders', description: 'Create and track work orders in ServiceNow' },
  { id: 'salesforce', name: 'Salesforce', category: 'crm', description: 'Sync spatial data with Salesforce objects' },
  { id: 'dynamics365', name: 'Microsoft Dynamics 365', category: 'crm', description: 'Integration with Dynamics 365' },
  { id: 'aws-s3', name: 'Amazon S3', category: 'storage', description: 'Store files and data in Amazon S3' },
  { id: 'azure-blob', name: 'Azure Blob Storage', category: 'storage', description: 'Store files in Azure Blob Storage' },
  { id: 'okta', name: 'Okta', category: 'auth', description: 'SSO with Okta' },
  { id: 'azure-ad', name: 'Azure Active Directory', category: 'auth', description: 'SSO with Azure AD / Entra ID' },
  { id: 'ms-teams', name: 'Microsoft Teams', category: 'notifications', description: 'Send notifications and maps to Teams' },
  { id: 'slack', name: 'Slack', category: 'notifications', description: 'Send notifications to Slack channels' },
  { id: 'powerbi', name: 'Power BI', category: 'bi', description: 'Push data to Power BI datasets' },
  { id: 'azure-iot', name: 'Azure IoT Hub', category: 'iot', description: 'Receive real-time sensor data' },
  { id: 'webhook-outgoing', name: 'Outgoing Webhook', category: 'custom', description: 'Send events to any HTTP endpoint' },
  { id: 'custom-api', name: 'Custom REST API', category: 'custom', description: 'Connect to any REST API' },
]

const MOCK_INSTALLED = [
  { id: 'inst-1', integration_id: 'ms-teams', name: 'Operations Channel', status: 'active', last_sync: '2 min ago' },
  { id: 'inst-2', integration_id: 'arcgis-server', name: 'Corporate GIS', status: 'active', last_sync: '1 hour ago' },
  { id: 'inst-3', integration_id: 'azure-ad', name: 'Company SSO', status: 'active', last_sync: null },
]

export default function IntegrationsPage() {
  const { isDesktop } = useBreakpoint()
  const [view, setView] = useState('installed') // 'installed' | 'catalog'
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showInstallModal, setShowInstallModal] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [installed, setInstalled] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch('/api/integrations/catalog').catch(() => []),
      apiFetch('/api/integrations/installed').catch(() => []),
    ]).then(([cat, inst]) => {
      setCatalog(Array.isArray(cat) ? cat : Object.values(cat || {}))
      setInstalled(Array.isArray(inst) ? inst : [])
    }).finally(() => setLoading(false))
  }, [])

  const categories = [...new Set(catalog.map(i => i.category))]

  const filteredCatalog = catalog.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
                          (i.description || '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || i.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const groupedCatalog = categories.reduce((acc, cat) => {
    const items = filteredCatalog.filter(i => i.category === cat)
    if (items.length > 0) {
      acc[cat] = items
    }
    return acc
  }, {})

  return (
    <div className="integrations-page">
      {/* Header */}
      {isDesktop && (
        <header className="page-header">
          <div>
            <h1 className="page-title">Integrations</h1>
            <p className="page-subtitle">Connect MightyTwin to your enterprise systems ({catalog.length} available)</p>
          </div>
        </header>
      )}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px', color: 'var(--text-secondary)' }}>
          <Loader size={16} className="spin" /> Loading integrations...
        </div>
      )}

      {/* Tabs */}
      <div className="integrations-tabs">
        <button 
          className={`tab ${view === 'installed' ? 'active' : ''}`}
          onClick={() => setView('installed')}
        >
          Installed ({installed.length})
        </button>
        <button 
          className={`tab ${view === 'catalog' ? 'active' : ''}`}
          onClick={() => setView('catalog')}
        >
          Browse Catalog
        </button>
      </div>

      {/* Search */}
      <div className="integrations-toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input 
            type="text" 
            placeholder={view === 'catalog' ? "Search integrations..." : "Filter installed..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Filter (catalog only) */}
      {view === 'catalog' && (
        <div className="category-filter">
          <button 
            className={`category-chip ${!selectedCategory ? 'active' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </button>
          {categories.map(cat => {
            const Icon = CATEGORY_ICONS[cat] || Settings
            return (
              <button
                key={cat}
                className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <Icon size={14} />
                {CATEGORY_LABELS[cat]}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      <div className="integrations-content">
        {view === 'installed' ? (
          <InstalledList 
            integrations={installed} 
            catalog={catalog}
            search={search}
          />
        ) : (
          <CatalogList 
            grouped={groupedCatalog} 
            installed={installed}
            onInstall={setShowInstallModal}
          />
        )}
      </div>

      {/* Install Modal */}
      {showInstallModal && (
        <InstallModal 
          integration={showInstallModal}
          onClose={() => setShowInstallModal(null)}
        />
      )}
    </div>
  )
}

function InstalledList({ integrations, catalog, search }) {
  const filtered = integrations.filter(i => {
    const catalogItem = catalog.find(c => c.id === i.integration_id)
    const name = catalogItem?.name || i.integration_id
    return name.toLowerCase().includes(search.toLowerCase()) ||
           i.name.toLowerCase().includes(search.toLowerCase())
  })

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔌</div>
        <h3 className="empty-state-title">No integrations installed</h3>
        <p className="empty-state-text">Browse the catalog to connect your systems</p>
      </div>
    )
  }

  return (
    <div className="installed-list">
      {filtered.map(inst => {
        const catalogItem = catalog.find(c => c.id === inst.integration_id)
        const Icon = CATEGORY_ICONS[catalogItem?.category] || Settings
        
        return (
          <div key={inst.id} className="installed-card">
            <div className="installed-icon">
              <Icon size={24} />
            </div>
            <div className="installed-info">
              <div className="installed-name">{inst.name}</div>
              <div className="installed-type">{catalogItem?.name}</div>
            </div>
            <div className="installed-status">
              {inst.status === 'active' ? (
                <span className="status-badge status-active">
                  <CheckCircle size={14} />
                  Active
                </span>
              ) : (
                <span className="status-badge status-error">
                  <AlertCircle size={14} />
                  Error
                </span>
              )}
              {inst.last_sync && (
                <span className="last-sync">Synced {inst.last_sync}</span>
              )}
            </div>
            <div className="installed-actions">
              <button className="btn btn-ghost btn-icon" title="Sync Now">
                <RefreshCw size={18} />
              </button>
              <button className="btn btn-ghost btn-icon" title="Settings">
                <Settings size={18} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CatalogList({ grouped, installed, onInstall }) {
  const installedIds = installed.map(i => i.integration_id)

  return (
    <div className="catalog-list">
      {Object.entries(grouped).map(([category, items]) => {
        const Icon = CATEGORY_ICONS[category] || Settings
        
        return (
          <div key={category} className="catalog-category">
            <h3 className="category-title">
              <Icon size={18} />
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="catalog-grid">
              {items.map(item => {
                const isInstalled = installedIds.includes(item.id)
                
                return (
                  <div key={item.id} className="catalog-card">
                    <div className="catalog-card-header">
                      <span className="catalog-name">{item.name}</span>
                      {isInstalled && (
                        <span className="installed-badge">
                          <Check size={12} />
                          Installed
                        </span>
                      )}
                    </div>
                    <p className="catalog-description">{item.description}</p>
                    <button 
                      className={`btn ${isInstalled ? 'btn-secondary' : 'btn-primary'} btn-sm btn-full`}
                      onClick={() => onInstall(item)}
                    >
                      {isInstalled ? 'Configure' : 'Install'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InstallModal({ integration, onClose }) {
  const [name, setName] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // Simulate test
    await new Promise(r => setTimeout(r, 1500))
    setTestResult({ success: true, message: 'Connection successful' })
    setTesting(false)
  }

  const handleInstall = () => {
    // Would call API
    onClose()
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-header">
          <h2>Install {integration.name}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Connection Name</label>
            <input 
              type="text"
              className="form-input"
              placeholder={`My ${integration.name}`}
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <p className="form-hint">A friendly name to identify this connection</p>
          </div>

          {/* Would render config fields based on integration.config_schema */}
          <div className="form-group">
            <label className="form-label">Configuration</label>
            <p className="placeholder-config">
              Configuration fields would appear here based on the integration type.
            </p>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button className="btn btn-primary" onClick={handleInstall}>
            Install
          </button>
        </div>
      </div>
    </>
  )
}
