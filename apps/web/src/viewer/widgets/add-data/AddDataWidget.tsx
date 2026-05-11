/**
 * AddDataWidget — floating panel with three tabs for getting data
 * into the viewer:
 *
 *   • Upload  — drag-drop user files (geojson / IFC / splat / etc.);
 *               splat georef detection from offset.xyz; destination
 *               radio (sketch / atlas / temp); upload queue.
 *   • Library — browse the workspace's shared layer library + add to
 *               site or active sketch.
 *   • Catalog — list external sources (WMS / WFS / 3D Tiles / COG)
 *               referenced live, not copied.
 *
 *  Mounted by CesiumViewer as a 480px floating panel anchored next
 *  to the left sidebar when the user clicks the "+" tab.
 *
 *  Backend endpoints are intentionally loose — Upload posts to the
 *  existing /api/spatial/sites/{slug}/layers/{id}/import-features
 *  flow when the destination is "atlas", and to a session-only
 *  in-memory queue when the destination is "sketch" or "temp".
 *  Library + Catalog endpoints don't exist yet; the component
 *  renders deterministic placeholder rows so the UI can be designed
 *  against until the API lands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload,
  Library,
  Link2,
  Star,
  Search,
  Grid3x3,
  List,
  X,
  Plus,
  FileText,
  Box,
} from 'lucide-react'
import './AddDataWidget.css'

type Tab = 'upload' | 'library' | 'catalog'

export type UploadDestination = 'sketch' | 'atlas' | 'temp'
export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface UploadEntry {
  id: string
  file: File
  status: UploadStatus
  progress: number
  /** Optional human-readable subtitle ("GeoJSON · 1,284 features"). */
  subtitle?: string
  errorMessage?: string
  /** Detected georef from a sidecar offset.xyz file, when paired with
   *  a .splat or .ply drop. */
  georef?: { lon: number; lat: number; alt: number; source: 'offset.xyz' | 'manual' }
  /** Tier badge to render — drives the visual language. */
  tier: 'upload' | 'site' | 'library' | 'catalog'
}

export interface AddDataWidgetProps {
  /** Called when the user clicks the × header button. */
  onClose: () => void
  /** Site context — used as the upload target when destination is
   *  "atlas". Null on the overview page (uploads still queue locally
   *  but the "Add to atlas" option is disabled). */
  siteSlug?: string | null
  /** Active sketch id from the design widget — when destination is
   *  "sketch" the uploaded layer is tagged with this id. */
  activeSketchId?: string | null
}

/** Recognised file extensions in the drop zone. */
const ACCEPTED = [
  '.geojson', '.json', '.ifc', '.ifczip',
  '.zip', '.splat', '.ply', '.xyz', '.csv',
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function extensionFor(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return ''
  return name.slice(dot).toLowerCase()
}

/** Try to parse an offset.xyz file (sidecar to .splat/.ply). Format:
 *  three whitespace-separated numbers on one line — lon lat alt. */
async function readOffsetXyz(file: File): Promise<{ lon: number; lat: number; alt: number } | null> {
  try {
    const text = await file.text()
    const parts = text.trim().split(/\s+/).slice(0, 3)
    if (parts.length < 3) return null
    const [lon, lat, alt] = parts.map(Number)
    if ([lon, lat, alt].some(n => !Number.isFinite(n))) return null
    return { lon, lat, alt }
  } catch {
    return null
  }
}

export default function AddDataWidget({
  onClose,
  siteSlug = null,
  activeSketchId = null,
}: AddDataWidgetProps) {
  const [tab, setTab] = useState<Tab>('upload')
  const [destination, setDestination] = useState<UploadDestination>('sketch')
  const [queue, setQueue] = useState<UploadEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Pending splat georef capture — when a .splat or .ply is dropped
  // without an offset.xyz sidecar, we stash its entry id here so the
  // georef row can render manual lon/lat/alt inputs targeted at it.
  const [pendingGeorefId, setPendingGeorefId] = useState<string | null>(null)
  const [manualLon, setManualLon] = useState('')
  const [manualLat, setManualLat] = useState('')
  const [manualAlt, setManualAlt] = useState('0')

  /** ── File ingestion ─────────────────────────────────────────────── */

  const ingestFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    // Look for a sidecar offset.xyz so we can auto-populate georef
    // for paired .splat / .ply drops.
    const offsetSidecar = arr.find(f => f.name.toLowerCase() === 'offset.xyz')
    const sidecarGeoref = offsetSidecar ? await readOffsetXyz(offsetSidecar) : null

    const newEntries: UploadEntry[] = arr
      // Don't queue the sidecar itself.
      .filter(f => f.name.toLowerCase() !== 'offset.xyz')
      .map((file) => {
        const ext = extensionFor(file.name)
        const isSplat = ext === '.splat' || ext === '.ply'
        const entry: UploadEntry = {
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          status: 'queued',
          progress: 0,
          subtitle: `${ext.replace('.', '').toUpperCase()} · ${formatSize(file.size)}`,
          tier: 'upload',
        }
        if (isSplat && sidecarGeoref) {
          entry.georef = { ...sidecarGeoref, source: 'offset.xyz' }
        }
        return entry
      })

    setQueue(prev => [...prev, ...newEntries])

    // If any splat/ply lacks a georef, surface the manual entry row
    // for the first one.
    const needsGeoref = newEntries.find(e => {
      const ext = extensionFor(e.file.name)
      return (ext === '.splat' || ext === '.ply') && !e.georef
    })
    if (needsGeoref) {
      setPendingGeorefId(needsGeoref.id)
      setManualLon('')
      setManualLat('')
      setManualAlt('0')
    }

    // Kick off simulated uploads — the real /api/upload + per-
    // destination routing lands when the backend endpoint exists.
    newEntries.forEach(entry => simulateUpload(entry.id))
  }, [])

  /** Simulated progress for queued files. Replace with a real
   *  XMLHttpRequest / fetch + onprogress when wiring against the
   *  upload endpoint; the entry-id pattern + setQueue updates stay
   *  the same. */
  const simulateUpload = useCallback((entryId: string) => {
    setQueue(prev => prev.map(e =>
      e.id === entryId ? { ...e, status: 'uploading' as const, progress: 5 } : e
    ))
    const id = setInterval(() => {
      setQueue(prev => {
        const cur = prev.find(e => e.id === entryId)
        if (!cur) { clearInterval(id); return prev }
        const next = Math.min(100, cur.progress + 4 + Math.random() * 10)
        if (next >= 100) {
          clearInterval(id)
          return prev.map(e => e.id === entryId
            ? { ...e, progress: 100, status: 'done' as const }
            : e)
        }
        return prev.map(e => e.id === entryId ? { ...e, progress: next } : e)
      })
    }, 180)
  }, [])

  /** Manual georef commit — clears pending state and writes the
   *  entered coords onto the entry. */
  const commitManualGeoref = useCallback(() => {
    if (!pendingGeorefId) return
    const lon = parseFloat(manualLon)
    const lat = parseFloat(manualLat)
    const alt = parseFloat(manualAlt) || 0
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return
    setQueue(prev => prev.map(e =>
      e.id === pendingGeorefId
        ? { ...e, georef: { lon, lat, alt, source: 'manual' as const } }
        : e
    ))
    setPendingGeorefId(null)
  }, [pendingGeorefId, manualLon, manualLat, manualAlt])

  /** ── Drag / drop wiring ─────────────────────────────────────────── */

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void ingestFiles(e.dataTransfer.files)
  }, [ingestFiles])

  return (
    <div className="addd" role="dialog" aria-label="Add Data">
      {/* Header */}
      <div className="addd__head">
        <div className="addd__title">
          <Plus size={14} />
          <span>Add Data</span>
        </div>
        <button
          type="button"
          className="addd__close"
          onClick={onClose}
          aria-label="Close Add Data"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="addd__tabs" role="tablist">
        <TabBtn active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload size={12} />} count={queue.length}>
          Upload
        </TabBtn>
        <TabBtn active={tab === 'library'} onClick={() => setTab('library')} icon={<Library size={12} />} count={LIBRARY_MOCK.length}>
          Library
        </TabBtn>
        <TabBtn active={tab === 'catalog'} onClick={() => setTab('catalog')} icon={<Link2 size={12} />} count={CATALOG_MOCK.length}>
          Catalog
        </TabBtn>
      </div>

      {/* Panel body */}
      <div className="addd__body">

        {tab === 'upload' && (
          <UploadTab
            destination={destination}
            setDestination={setDestination}
            queue={queue}
            dragOver={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPickFiles={() => fileInputRef.current?.click()}
            fileInputRef={fileInputRef}
            onInputChange={(e) => { if (e.target.files) void ingestFiles(e.target.files) }}
            siteSlug={siteSlug}
            activeSketchId={activeSketchId}
            pendingGeorefId={pendingGeorefId}
            manualLon={manualLon}
            manualLat={manualLat}
            manualAlt={manualAlt}
            setManualLon={setManualLon}
            setManualLat={setManualLat}
            setManualAlt={setManualAlt}
            commitManualGeoref={commitManualGeoref}
            dismissPendingGeoref={() => setPendingGeorefId(null)}
          />
        )}

        {tab === 'library' && <LibraryTab siteSlug={siteSlug} />}
        {tab === 'catalog' && <CatalogTab />}
      </div>

      {/* Tier legend (always-on footer) */}
      <div className="addd__legend">
        <span className="addd__legend-item">
          <span className="addd__legend-dot addd__legend-dot--site" /> Site layer
        </span>
        <span className="addd__legend-item">
          <Upload size={9} className="addd__legend-icon addd__legend-icon--upload" /> Uploaded (design)
        </span>
        <span className="addd__legend-item">
          <Star size={9} className="addd__legend-icon addd__legend-icon--library" /> Library
        </span>
        <span className="addd__legend-item">
          <Link2 size={9} className="addd__legend-icon addd__legend-icon--catalog" /> External catalog
        </span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
   Inner pieces
   ────────────────────────────────────────────────────────────────────── */

function TabBtn({
  active, onClick, icon, count, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`addd__tab${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{children}</span>
      <span className="addd__tab-badge">{count}</span>
    </button>
  )
}

/* ── Upload ────────────────────────────────────────────────────────── */

interface UploadTabProps {
  destination: UploadDestination
  setDestination: (d: UploadDestination) => void
  queue: UploadEntry[]
  dragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onPickFiles: () => void
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  siteSlug: string | null
  activeSketchId: string | null
  pendingGeorefId: string | null
  manualLon: string
  manualLat: string
  manualAlt: string
  setManualLon: (v: string) => void
  setManualLat: (v: string) => void
  setManualAlt: (v: string) => void
  commitManualGeoref: () => void
  dismissPendingGeoref: () => void
}

function UploadTab(p: UploadTabProps) {
  const pendingEntry = p.pendingGeorefId ? p.queue.find(e => e.id === p.pendingGeorefId) : null
  const atlasDisabled = !p.siteSlug

  return (
    <>
      <div
        className={`addd-dz${p.dragOver ? ' is-over' : ''}`}
        onDragOver={p.onDragOver}
        onDragLeave={p.onDragLeave}
        onDrop={p.onDrop}
        onClick={p.onPickFiles}
        role="button"
        tabIndex={0}
      >
        <div className="addd-dz__icon"><Upload size={20} /></div>
        <div className="addd-dz__title">Drop files here or click to browse</div>
        <div className="addd-dz__sub">
          Files added here become "design uploads" — tagged separately from site layers.
        </div>
        <div className="addd-dz__formats">{ACCEPTED.join(' · ')}</div>
        <input
          ref={p.fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          multiple
          hidden
          accept={ACCEPTED.join(',')}
          onChange={p.onInputChange}
        />
      </div>

      {pendingEntry && (
        <div className="addd-georef" role="region" aria-label="Splat georeference">
          <div className="addd-georef__title">
            Splat georeference — offset.xyz not detected
          </div>
          <div className="addd-georef__fields">
            <label>
              <span>Longitude</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="151.2093"
                value={p.manualLon}
                onChange={e => p.setManualLon(e.target.value)}
              />
            </label>
            <label>
              <span>Latitude</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="-33.8688"
                value={p.manualLat}
                onChange={e => p.setManualLat(e.target.value)}
              />
            </label>
            <label>
              <span>Altitude (m)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={p.manualAlt}
                onChange={e => p.setManualAlt(e.target.value)}
              />
            </label>
          </div>
          <div className="addd-georef__actions">
            <button type="button" className="addd-btn" onClick={p.commitManualGeoref}>
              Apply
            </button>
            <button type="button" className="addd-btn addd-btn--ghost" onClick={p.dismissPendingGeoref}>
              Skip
            </button>
          </div>
          <div className="addd-georef__hint">
            Drop an <code>offset.xyz</code> alongside the splat next time to
            auto-populate.
          </div>
        </div>
      )}

      <div className="addd-dest" role="radiogroup" aria-label="Upload destination">
        <DestBtn
          active={p.destination === 'sketch'}
          onClick={() => p.setDestination('sketch')}
          disabled={!p.activeSketchId}
        >Add to current sketch</DestBtn>
        <DestBtn
          active={p.destination === 'atlas'}
          onClick={() => p.setDestination('atlas')}
          disabled={atlasDisabled}
        >Add to atlas</DestBtn>
        <DestBtn
          active={p.destination === 'temp'}
          onClick={() => p.setDestination('temp')}
        >Keep as temp</DestBtn>
      </div>

      {p.queue.length > 0 && (
        <>
          <div className="addd-queue__hd">Upload queue · {p.queue.length} file{p.queue.length === 1 ? '' : 's'}</div>
          <div className="addd-queue">
            {p.queue.map(entry => <QueueRow key={entry.id} entry={entry} />)}
          </div>
        </>
      )}
    </>
  )
}

function DestBtn({
  active, onClick, disabled = false, children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      className={`addd-dest__opt${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function QueueRow({ entry }: { entry: UploadEntry }) {
  const ext = extensionFor(entry.file.name)
  return (
    <div className={`addd-row${entry.status === 'uploading' ? ' is-uploading' : ''}`}>
      <div className="addd-row__icon">
        {ext === '.splat' || ext === '.ply' ? <Box size={14} /> : <FileText size={14} />}
      </div>
      <div className="addd-row__info">
        <div className="addd-row__name">{entry.file.name}</div>
        <div className="addd-row__sub">
          <span className="addd-tier addd-tier--upload">
            <Upload size={8} /> Design upload
          </span>
          {entry.subtitle}
          {entry.georef && (
            <span className="addd-row__georef">
              · georef {entry.georef.source}
            </span>
          )}
        </div>
      </div>
      <div className="addd-row__size">{formatSize(entry.file.size)}</div>
      <span className={`addd-row__status addd-row__status--${entry.status}`}>
        {entry.status.toUpperCase()}
      </span>
      <div className="addd-row__progress">
        <div
          className="addd-row__progress-bar"
          style={{
            width: `${entry.progress}%`,
            background: entry.status === 'error'
              ? 'var(--addd-red)'
              : entry.status === 'done'
                ? 'var(--addd-green)'
                : undefined,
          }}
        />
      </div>
    </div>
  )
}

/* ── Library (mock) ─────────────────────────────────────────────────── */

interface LibraryItem {
  id: string
  name: string
  type: '2d' | '3d' | 'ifc' | 'splat' | 'geojson' | 'cog'
  date: string
  size: string
  authoritative?: boolean
}

const LIBRARY_FOLDERS = [
  { id: 'all',      label: 'All layers',      indent: 0 },
  { id: 'sydney',   label: 'Sydney Harbour',  indent: 1 },
  { id: 'forrest',  label: 'Forrest Airport', indent: 1 },
  { id: 'basemaps', label: 'Basemaps',        indent: 1 },
  { id: '3d',       label: '3D assets',       indent: 0 },
  { id: 'splats',   label: 'Splats',          indent: 0 },
  { id: 'ifc',      label: 'IFC models',      indent: 0 },
]

const LIBRARY_MOCK: LibraryItem[] = [
  { id: 'l1', name: 'Terminal Building (3DGS)',  type: 'splat',   date: '2025-04-12', size: '2.1 GB', authoritative: true },
  { id: 'l2', name: 'Terminal Roof Structure',   type: 'ifc',     date: '2025-03-08', size: '84 MB' },
  { id: 'l3', name: 'Terminal Site Boundary',    type: 'geojson', date: '2025-02-20', size: '12 KB', authoritative: true },
  { id: 'l4', name: 'Apron Aerial Imagery',      type: 'cog',     date: '2025-01-14', size: '740 MB' },
]

type Filter = 'all' | '2d' | '3d' | 'ifc' | 'splat' | 'geojson'

function LibraryTab({ siteSlug }: { siteSlug: string | null }) {
  const [folder, setFolder] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'tile' | 'list'>('tile')

  const visible = useMemo(() => LIBRARY_MOCK.filter(item => {
    if (filter !== 'all' && item.type !== filter) return false
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [filter, query])

  void folder // folder filter is a UI-only stub for the mock data

  return (
    <div className="addd-lib">
      <div className="addd-lib__tree">
        {LIBRARY_FOLDERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`addd-lib__node${folder === f.id ? ' is-active' : ''}`}
            style={{ paddingLeft: 8 + f.indent * 14 }}
            onClick={() => setFolder(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="addd-lib__main">
        <div className="addd-lib__toolbar">
          <div className="addd-lib__search">
            <Search size={12} />
            <input
              type="text"
              placeholder="Search the library…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="addd-lib__view">
            <button
              type="button"
              className={view === 'tile' ? 'is-on' : ''}
              onClick={() => setView('tile')}
              aria-label="Tile view"
            >
              <Grid3x3 size={12} />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-on' : ''}
              onClick={() => setView('list')}
              aria-label="List view"
            >
              <List size={12} />
            </button>
          </div>
        </div>
        <div className="addd-lib__chips">
          {(['all', '2d', '3d', 'ifc', 'splat', 'geojson'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              className={`addd-chip${filter === f ? ' is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={`addd-lib__grid is-${view}`}>
          {visible.length === 0 ? (
            <div className="addd-lib__empty">
              No matches in the library yet.
            </div>
          ) : (
            visible.map(item => (
              <div key={item.id} className="addd-lib__card">
                <div className="addd-lib__thumb">
                  {item.type === 'splat' ? <Box size={20} /> : <FileText size={20} />}
                  {item.authoritative && (
                    <span className="addd-lib__star" title="Authoritative">
                      <Star size={11} fill="currentColor" />
                    </span>
                  )}
                </div>
                <div className="addd-lib__title">{item.name}</div>
                <div className="addd-lib__meta">
                  <span className="addd-tier addd-tier--library">
                    {item.type.toUpperCase()} · {item.size}
                  </span>
                  <span>{item.date}</span>
                </div>
                <div className="addd-lib__actions">
                  <button
                    type="button"
                    className="addd-btn"
                    disabled={!siteSlug}
                    title={siteSlug ? `Add to ${siteSlug}` : 'Open a site to add to atlas'}
                  >
                    Add to site
                  </button>
                  <button type="button" className="addd-btn addd-btn--ghost">
                    Add to sketch
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Catalog (mock) ─────────────────────────────────────────────────── */

interface CatalogEntry {
  id: string
  name: string
  type: 'WMS' | 'WFS' | '3D Tiles' | 'COG'
  url: string
  status: 'live' | 'unreachable'
}

const CATALOG_MOCK: CatalogEntry[] = [
  { id: 'c1', name: 'NSW Aerial Imagery — Sydney', type: 'WMS',     url: 'https://maps.six.nsw.gov.au/arcgis/services/public/NSW_Imagery/MapServer/WMSServer', status: 'live' },
  { id: 'c2', name: 'Cesium ION — World Terrain',  type: '3D Tiles', url: 'https://assets.cesium.com/1/tileset.json', status: 'live' },
  { id: 'c3', name: 'DCCEEW Cadastral WFS',         type: 'WFS',     url: 'https://services.land.vic.gov.au/catalogue/publicproxy/guest/dv_geoserver/wfs', status: 'live' },
  { id: 'c4', name: 'Forrest Airport — Pavement Survey COG', type: 'COG', url: 'https://storage.cloud.example/forrest/pavement-2025.tif', status: 'unreachable' },
]

function CatalogTab() {
  const [browseOpen, setBrowseOpen] = useState(false)
  return (
    <div className="addd-cat">
      <div className="addd-cat__list">
        {CATALOG_MOCK.map(c => (
          <div key={c.id} className="addd-cat__row">
            <div className="addd-cat__icon"><Link2 size={14} /></div>
            <div className="addd-cat__info">
              <div className="addd-cat__name">{c.name}</div>
              <div className="addd-cat__url">{c.url}</div>
            </div>
            <span className="addd-tier addd-tier--catalog">{c.type}</span>
            <span className={`addd-cat__status addd-cat__status--${c.status}`}>
              <span className="addd-cat__dot" />
              {c.status === 'live' ? 'Live' : 'Unreachable'}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="addd-btn addd-btn--primary"
        onClick={() => setBrowseOpen(true)}
      >
        <Plus size={12} /> Browse external sources…
      </button>
      {browseOpen && (
        <CatalogBrowseModal onClose={() => setBrowseOpen(false)} />
      )}
    </div>
  )
}

function CatalogBrowseModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CatalogEntry['type']>('WMS')
  const [url, setUrl] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="addd-modal__backdrop" onClick={onClose}>
      <div className="addd-modal" role="dialog" aria-label="Add external source" onClick={e => e.stopPropagation()}>
        <div className="addd-modal__hd">
          <span>Add external source</span>
          <button type="button" className="addd__close" onClick={onClose} aria-label="Close">
            <X size={12} />
          </button>
        </div>
        <label className="addd-modal__field">
          <span>Display name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="NSW Imagery — Sydney" />
        </label>
        <label className="addd-modal__field">
          <span>Type</span>
          <select value={type} onChange={e => setType(e.target.value as CatalogEntry['type'])}>
            <option value="WMS">WMS</option>
            <option value="WFS">WFS</option>
            <option value="3D Tiles">3D Tiles</option>
            <option value="COG">COG</option>
          </select>
        </label>
        <label className="addd-modal__field">
          <span>URL</span>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <div className="addd-modal__hint">
          Catalog entries are <strong>references</strong> — they're not
          copied into your site. They appear in atlas layers with an
          external badge.
        </div>
        <div className="addd-modal__actions">
          <button type="button" className="addd-btn addd-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="addd-btn addd-btn--primary"
            disabled={!name.trim() || !url.trim()}
            onClick={() => {
              // TODO wire to POST /api/catalog-sources once the
              // backend table + endpoint exist. For now, log + close.
              console.log('TODO catalog-source create', { name, type, url })
              onClose()
            }}
          >
            Add source
          </button>
        </div>
      </div>
    </div>
  )
}
