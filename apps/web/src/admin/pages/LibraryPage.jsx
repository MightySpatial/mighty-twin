import { useState } from 'react'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { Search, Plus, Grid, List, ChevronRight, FolderOpen, Image, FileText, File } from 'lucide-react'
import '../styles/components.css'
import './LibraryPage.css'

const LIBRARY_ITEMS = [
  { id: 1, name: 'Site Photos', type: 'folder', items: 24 },
  { id: 2, name: 'Survey Data', type: 'folder', items: 8 },
  { id: 3, name: 'IMG_001.jpg', type: 'image', size: '2.4 MB' },
  { id: 4, name: 'IMG_002.jpg', type: 'image', size: '1.8 MB' },
  { id: 5, name: 'Site_Report.pdf', type: 'pdf', size: '4.2 MB' },
  { id: 6, name: 'Survey_Notes.txt', type: 'file', size: '12 KB' },
]

const getIcon = (type) => {
  switch (type) {
    case 'folder': return FolderOpen
    case 'image': return Image
    case 'pdf': return FileText
    default: return File
  }
}

const getIconColor = (type) => {
  switch (type) {
    case 'folder': return '#6366f1'
    case 'image': return '#22c55e'
    case 'pdf': return '#ef4444'
    default: return '#94a3b8'
  }
}

export default function LibraryPage() {
  const { isDesktop } = useBreakpoint()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'

  const filteredItems = LIBRARY_ITEMS.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="library-page">
      {/* Desktop header */}
      {isDesktop && (
        <header className="page-header page-header-with-action">
          <div>
            <h1 className="page-title">Library</h1>
            <p className="page-subtitle">{LIBRARY_ITEMS.length} items</p>
          </div>
          <button className="btn btn-primary">
            <Plus size={20} />
            Upload
          </button>
        </header>
      )}

      {/* Breadcrumb */}
      <div className="library-breadcrumb">
        <button className="breadcrumb-item">Library</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">Root</span>
      </div>

      {/* Toolbar */}
      <div className="library-toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input 
            type="text" 
            placeholder="Search files..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="view-toggle">
          <button 
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <Grid size={20} />
          </button>
          <button 
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <div className="library-grid">
          {filteredItems.map(item => {
            const Icon = getIcon(item.type)
            return (
              <div key={item.id} className="library-grid-item">
                <div 
                  className="library-grid-thumb"
                  style={{ background: getIconColor(item.type) + '20' }}
                >
                  <Icon size={32} color={getIconColor(item.type)} />
                </div>
                <span className="library-grid-name">{item.name}</span>
                <span className="library-grid-meta">
                  {item.type === 'folder' ? `${item.items} items` : item.size}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card-list library-list">
          {filteredItems.map(item => {
            const Icon = getIcon(item.type)
            return (
              <div key={item.id} className="card card-interactive list-card">
                <div className="library-list-icon" style={{ color: getIconColor(item.type) }}>
                  <Icon size={24} />
                </div>
                <div className="list-card-content">
                  <span className="list-card-title">{item.name}</span>
                  <span className="list-card-subtitle">
                    {item.type === 'folder' ? `${item.items} items` : item.size}
                  </span>
                </div>
                <ChevronRight size={20} className="list-card-chevron" />
              </div>
            )
          })}
        </div>
      )}

      {/* FAB for mobile/tablet */}
      {!isDesktop && (
        <button className="fab fab-br">
          <Plus size={24} />
        </button>
      )}
    </div>
  )
}
