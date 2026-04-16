/**
 * MightyDT 2.0 Admin — Upload Page
 * Drag-and-drop / click-to-select file upload to POST /api/upload.
 * Supports all spatial formats: GeoJSON, GeoPackage, IFC, LAS/LAZ, GeoTIFF, etc.
 */
import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { API_URL } from '../hooks/useApi'
import {
  Upload, X, CheckCircle, AlertCircle, FileText,
  Loader, ChevronLeft, CloudUpload
} from 'lucide-react'
import '../styles/components.css'
import './UploadPage.css'

// ─── Accepted extensions ──────────────────────────────────────────────────────

const ACCEPTED_EXTS = [
  '.geojson', '.json', '.gpkg', '.shp', '.kml', '.csv',
  '.tif', '.tiff', '.geotiff',
  '.ifc', '.ifczip',
  '.las', '.laz', '.ply',
  '.splat',
]

const TYPE_LABELS = {
  geojson: 'GeoJSON', json: 'JSON', gpkg: 'GeoPackage', shp: 'Shapefile',
  kml: 'KML', csv: 'CSV', tif: 'GeoTIFF', tiff: 'GeoTIFF', geotiff: 'GeoTIFF',
  ifc: 'IFC', ifczip: 'IFC Zip', las: 'LAS', laz: 'LAZ', ply: 'PLY', splat: 'Splat',
}

function formatBytes(b) {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function extOf(name) {
  return name.split('.').pop()?.toLowerCase() || ''
}

// ─── Per-file upload state ────────────────────────────────────────────────────

// status: idle | uploading | done | error
function makeFileEntry(file) {
  return {
    id: Math.random().toString(36).slice(2),
    file,
    name: file.name,
    size: file.size,
    customName: file.name.replace(/\.[^.]+$/, ''),
    status: 'idle',
    progress: 0,
    error: null,
    result: null,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  const [entries, setEntries] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const addFiles = useCallback((files) => {
    const valid = Array.from(files).filter(f => {
      const ext = '.' + extOf(f.name)
      return ACCEPTED_EXTS.includes(ext)
    })
    setEntries(prev => [...prev, ...valid.map(makeFileEntry)])
  }, [])

  // Drag handlers
  const onDragOver = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = e => { e.preventDefault(); setDragging(false) }
  const onDrop = e => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }
  const onFileInput = e => addFiles(e.target.files)

  const removeEntry = (id) =>
    setEntries(prev => prev.filter(e => e.id !== id))

  const updateEntry = (id, patch) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))

  const uploadEntry = async (entry) => {
    updateEntry(entry.id, { status: 'uploading', progress: 0, error: null })

    const formData = new FormData()
    formData.append('file', entry.file)
    formData.append('name', entry.customName || entry.name)

    try {
      // Use XHR for progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_URL}/api/upload`)
        xhr.withCredentials = true

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateEntry(entry.id, { progress: Math.round((e.loaded / e.total) * 95) })
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText)
              updateEntry(entry.id, { status: 'done', progress: 100, result })
              resolve(result)
            } catch {
              reject(new Error('Invalid response'))
            }
          } else {
            let msg = `Upload failed (${xhr.status})`
            try { msg = JSON.parse(xhr.responseText)?.detail || msg } catch { /* ignore */ }
            reject(new Error(msg))
          }
        }

        xhr.onerror = () => reject(new Error('Network error'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))

        // Remove Content-Type header — let browser set multipart boundary
        xhr.send(formData)
      })
    } catch (err) {
      updateEntry(entry.id, { status: 'error', error: err.message })
    }
  }

  const uploadAll = () => {
    entries
      .filter(e => e.status === 'idle' || e.status === 'error')
      .forEach(uploadEntry)
  }

  const pendingCount = entries.filter(e => e.status === 'idle' || e.status === 'error').length
  const doneCount = entries.filter(e => e.status === 'done').length
  const allDone = entries.length > 0 && entries.every(e => e.status === 'done')

  return (
    <div className="upload-page">
      {isDesktop && (
        <header className="page-header page-header-with-action">
          <div>
            <button className="btn btn-ghost" style={{ marginBottom: 4 }} onClick={() => navigate('/admin/data')}>
              <ChevronLeft size={18} /> Back to Data Store
            </button>
            <h1 className="page-title">Upload Data</h1>
            <p className="page-subtitle">
              Supported: GeoJSON, GeoPackage, IFC, LAS/LAZ, GeoTIFF, KML, CSV, Splat
            </p>
          </div>
          {entries.length > 0 && pendingCount > 0 && (
            <button className="btn btn-primary" onClick={uploadAll}>
              <CloudUpload size={20} />
              Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
          {allDone && (
            <button className="btn btn-secondary" onClick={() => navigate('/admin/data')}>
              <CheckCircle size={18} />
              View Data Store
            </button>
          )}
        </header>
      )}

      {/* Drop zone */}
      <div
        className={`drop-zone ${dragging ? 'drop-zone-active' : ''} ${entries.length > 0 ? 'drop-zone-compact' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTS.join(',')}
          style={{ display: 'none' }}
          onChange={onFileInput}
        />
        {entries.length === 0 ? (
          <>
            <div className="drop-icon"><Upload size={40} /></div>
            <p className="drop-title">Drop files here or click to browse</p>
            <p className="drop-hint">GeoJSON · GeoPackage · IFC · LAS/LAZ · GeoTIFF · KML · CSV</p>
          </>
        ) : (
          <>
            <div className="drop-icon-sm"><Upload size={22} /></div>
            <p className="drop-title-sm">Add more files</p>
          </>
        )}
      </div>

      {/* File list */}
      {entries.length > 0 && (
        <div className="upload-list">
          {entries.map(entry => (
            <div key={entry.id} className={`upload-item upload-item-${entry.status}`}>
              <div className="upload-item-icon">
                {entry.status === 'done'
                  ? <CheckCircle size={20} color="#4ade80" />
                  : entry.status === 'error'
                    ? <AlertCircle size={20} color="#f87171" />
                    : entry.status === 'uploading'
                      ? <Loader size={20} className="spin" />
                      : <FileText size={20} />}
              </div>

              <div className="upload-item-info">
                {entry.status === 'idle' ? (
                  <input
                    className="upload-name-input"
                    value={entry.customName}
                    onChange={e => updateEntry(entry.id, { customName: e.target.value })}
                    placeholder="Display name"
                  />
                ) : (
                  <span className="upload-item-name">{entry.customName || entry.name}</span>
                )}
                <span className="upload-item-meta">
                  {TYPE_LABELS[extOf(entry.name)] || extOf(entry.name).toUpperCase()}
                  {' · '}{formatBytes(entry.size)}
                  {entry.status === 'uploading' && ` · ${entry.progress}%`}
                  {entry.status === 'error' && (
                    <span className="upload-error-text"> · {entry.error}</span>
                  )}
                  {entry.status === 'done' && entry.result && (
                    <span className="upload-done-text"> · Ready</span>
                  )}
                </span>

                {/* Progress bar */}
                {entry.status === 'uploading' && (
                  <div className="upload-progress-bar">
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="upload-item-actions">
                {(entry.status === 'idle' || entry.status === 'error') && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={e => { e.stopPropagation(); uploadEntry(entry) }}
                  >
                    Upload
                  </button>
                )}
                {entry.status !== 'uploading' && (
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={e => { e.stopPropagation(); removeEntry(entry.id) }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile action bar */}
      {!isDesktop && entries.length > 0 && pendingCount > 0 && (
        <div className="mobile-action-bar">
          <button className="btn btn-primary btn-full" onClick={uploadAll}>
            <CloudUpload size={20} />
            Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
