/** Atlas — Upload (T+810 rebuild).
 *
 *  Drag-drop file upload to /api/upload (multipart/form-data, admin
 *  only). Per-file row with rename + progress + result chip. Uploads
 *  via XHR so we get real upload progress, not just wait-for-fetch.
 *
 *  Accepted extensions tracked against the backend's actual support
 *  (csv, geojson, json, xlsx). The v1 page advertised gpkg/shp/ifc/
 *  las/etc which the backend rejects with 415; trimming to the real
 *  list avoids the silent-failure trap.
 */

import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  CloudUpload,
  FileText,
  Loader,
  Upload,
  X,
} from 'lucide-react'
import { API_URL } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useToast } from '../../viewer/hooks/useToast'

const ACCEPTED_EXTS = ['.csv', '.geojson', '.json', '.xlsx', '.xlsm']

const TYPE_LABELS: Record<string, string> = {
  csv: 'CSV',
  geojson: 'GeoJSON',
  json: 'JSON',
  xlsx: 'Excel',
  xlsm: 'Excel (macros)',
}

const MAX_BYTES = 50 * 1024 * 1024

type Status = 'idle' | 'uploading' | 'done' | 'error'

interface Entry {
  id: string
  file: File
  name: string
  size: number
  customName: string
  status: Status
  progress: number
  error: string | null
  result: { id?: string; name?: string } | null
}

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

function makeEntry(file: File): Entry {
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

export default function UploadPage() {
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const { addToast } = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid: Entry[] = []
    const rejected: { name: string; reason: string }[] = []
    for (const f of Array.from(files)) {
      const ext = '.' + extOf(f.name)
      if (!ACCEPTED_EXTS.includes(ext)) {
        rejected.push({ name: f.name, reason: `${ext || '(no extension)'} is not supported` })
        continue
      }
      if (f.size > MAX_BYTES) {
        rejected.push({
          name: f.name,
          reason: `Exceeds 50 MB cap (${fmtBytes(f.size)})`,
        })
        continue
      }
      valid.push(makeEntry(f))
    }
    if (rejected.length > 0) {
      const summary = rejected
        .slice(0, 3)
        .map((r) => `${r.name} — ${r.reason}`)
        .join(' · ')
      addToast(
        'warning',
        `Skipped ${rejected.length} file${rejected.length === 1 ? '' : 's'}: ${summary}`,
      )
    }
    setEntries((prev) => [...prev, ...valid])
  }, [addToast])

  const updateEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const removeEntry = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id))

  async function uploadEntry(entry: Entry) {
    updateEntry(entry.id, { status: 'uploading', progress: 0, error: null })
    const fd = new FormData()
    fd.append('file', entry.file)
    fd.append('name', entry.customName || entry.name)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_URL}/api/upload`)
        xhr.withCredentials = true
        const token = localStorage.getItem('accessToken')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateEntry(entry.id, {
              progress: Math.round((e.loaded / e.total) * 95),
            })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText)
              updateEntry(entry.id, { status: 'done', progress: 100, result })
              resolve()
            } catch {
              reject(new Error('Invalid response from server'))
            }
          } else {
            let msg = `Upload failed (${xhr.status})`
            try {
              msg = JSON.parse(xhr.responseText)?.detail || msg
            } catch {
              /* keep default */
            }
            reject(new Error(msg))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.onabort = () => reject(new Error('Cancelled'))
        xhr.send(fd)
      })
    } catch (err) {
      updateEntry(entry.id, { status: 'error', error: (err as Error).message })
    }
  }

  function uploadAll() {
    entries
      .filter((e) => e.status === 'idle' || e.status === 'error')
      .forEach((e) => uploadEntry(e))
  }

  const pendingCount = entries.filter((e) => e.status === 'idle' || e.status === 'error').length
  const allDone = entries.length > 0 && entries.every((e) => e.status === 'done')

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => navigate('/admin/data')} style={ghostBtn}>
          <ChevronLeft size={14} /> Data sources
        </button>
        <div style={{ flex: 1 }} />
        {pendingCount > 0 && (
          <button onClick={uploadAll} style={primaryBtn}>
            <CloudUpload size={14} /> Upload {pendingCount} file
            {pendingCount === 1 ? '' : 's'}
          </button>
        )}
        {allDone && (
          <button onClick={() => navigate('/admin/data')} style={primaryBtn}>
            <CheckCircle size={14} /> View data sources
          </button>
        )}
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Upload data</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
          CSV · GeoJSON · JSON · Excel · 50 MB max per file
        </p>
      </header>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: entries.length === 0 ? 40 : 20,
          border: `2px dashed ${
            dragging ? 'rgba(36,83,255,0.5)' : 'rgba(255,255,255,0.12)'
          }`,
          background: dragging ? 'rgba(36,83,255,0.06)' : 'rgba(255,255,255,0.02)',
          borderRadius: 14,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'background 120ms, border-color 120ms',
          marginBottom: entries.length > 0 ? 14 : 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTS.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files ?? [])}
        />
        {entries.length === 0 ? (
          <>
            <div
              style={{
                width: 56,
                height: 56,
                margin: '0 auto 12px',
                borderRadius: 14,
                background: 'rgba(36,83,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9bb3ff',
              }}
            >
              <Upload size={26} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.5)' }}>
              CSV · GeoJSON · JSON · Excel · 50 MB max
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'rgba(240,242,248,0.7)',
            }}
          >
            <Upload size={16} /> Add more files
          </div>
        )}
      </div>

      {/* File list */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              onRename={(name) => updateEntry(entry.id, { customName: name })}
              onUpload={() => uploadEntry(entry)}
              onRemove={() => removeEntry(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  entry,
  onRename,
  onUpload,
  onRemove,
}: {
  entry: Entry
  onRename: (name: string) => void
  onUpload: () => void
  onRemove: () => void
}) {
  const tint =
    entry.status === 'done'
      ? '#34d399'
      : entry.status === 'error'
      ? '#fb7185'
      : entry.status === 'uploading'
      ? '#9bb3ff'
      : 'rgba(240,242,248,0.5)'
  const Icon =
    entry.status === 'done'
      ? CheckCircle
      : entry.status === 'error'
      ? AlertCircle
      : entry.status === 'uploading'
      ? Loader
      : FileText

  return (
    <div
      style={{
        position: 'relative',
        padding: 12,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${entry.status === 'error' ? 'rgba(251,113,133,0.32)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tint,
          flexShrink: 0,
        }}
      >
        <Icon size={18} className={entry.status === 'uploading' ? 'spin' : undefined} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {entry.status === 'idle' ? (
          <input
            value={entry.customName}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Display name"
            style={{
              width: '100%',
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 5,
              color: '#f0f2f8',
              fontSize: 13,
              fontWeight: 500,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entry.customName || entry.name}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.45)', marginTop: 4 }}>
          {TYPE_LABELS[extOf(entry.name)] ?? extOf(entry.name).toUpperCase()}
          {' · '}
          {fmtBytes(entry.size)}
          {entry.status === 'uploading' && <> · {entry.progress}%</>}
          {entry.status === 'error' && (
            <span style={{ color: '#fca5a5' }}> · {entry.error}</span>
          )}
          {entry.status === 'done' && (
            <span style={{ color: '#34d399' }}> · Ready</span>
          )}
        </div>
        {entry.status === 'uploading' && (
          <div
            style={{
              marginTop: 6,
              height: 3,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${entry.progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #2453ff, #a78bfa)',
                transition: 'width 200ms',
              }}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(entry.status === 'idle' || entry.status === 'error') && (
          <button onClick={onUpload} style={smallPrimary}>
            Upload
          </button>
        )}
        {entry.status !== 'uploading' && (
          <button onClick={onRemove} style={iconBtn} title="Remove">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const smallPrimary: React.CSSProperties = {
  padding: '6px 12px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  padding: 6,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: 'rgba(240,242,248,0.6)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}
