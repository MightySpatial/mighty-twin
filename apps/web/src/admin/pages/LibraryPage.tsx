/** Atlas Library — Phase P + T (T+120) full rebuild.
 *
 *  Wired to the real `/api/library/*` endpoints. Replaces the v1 stub
 *  page that rendered fake demo rows. Surface follows the same visual
 *  language as Overview / Submissions / Sites:
 *
 *    - Top header: title + uploaded-bytes / item-count summary
 *    - Breadcrumb showing the current folder path with click-to-jump
 *    - Toolbar: search, view toggle (grid/list), New folder, New item
 *    - Body: child folders first, then items. Multi-select for bulk.
 *    - Bulk action bar appears when ≥ 1 item selected.
 *
 *  Items are content-addressed by URL — Library is *not* an upload
 *  pipeline (Upload page handles the storage write); it's the index
 *  layer that catalogs what's been uploaded into folders.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Grid as GridIcon,
  List as ListIcon,
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
  Trash2,
  FolderInput,
  X,
  ArrowLeft,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface Folder {
  id: string
  parent_id: string | null
  name: string
  slug: string
  depth: number
  children?: Folder[]
}

interface Item {
  id: string
  folder_id: string | null
  name: string
  kind: string
  url: string | null
  size_bytes: number | null
  metadata: Record<string, unknown>
  created_at: string | null
}

const KIND_ICON: Record<string, typeof FileIcon> = {
  photo: ImageIcon,
  document: FileText,
  bim: FileIcon,
  other: FileIcon,
}

const KIND_COLOR: Record<string, string> = {
  photo: '#22c55e',
  document: '#fb7185',
  bim: '#a78bfa',
  other: '#94a3b8',
}

function fmtBytes(b: number | null): string {
  if (!b || b <= 0) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

export default function LibraryPage() {
  const { isPhone } = useBreakpoint()
  const [tree, setTree] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showNewItem, setShowNewItem] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newItem, setNewItem] = useState({ name: '', kind: 'photo', url: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const flat = useMemo(() => flattenTree(tree), [tree])
  const byId = useMemo(() => new Map(flat.map((f) => [f.id, f])), [flat])
  const path = useMemo(() => buildPath(folderId, byId), [folderId, byId])
  const childFolders = useMemo(
    () => flat.filter((f) => f.parent_id === folderId),
    [flat, folderId],
  )

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [t, i] = await Promise.all([
        apiFetch('/api/library/folders/tree'),
        apiFetch(`/api/library/items?folder_id=${folderId ?? 'root'}`),
      ])
      setTree((t as Folder[]) ?? [])
      setItems((i as Item[]) ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId])

  const filteredFolders = childFolders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  )
  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  )

  async function createFolder() {
    if (!newFolderName.trim()) return
    try {
      await apiFetch('/api/library/folders', {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName.trim(), parent_id: folderId }),
      })
      setNewFolderName('')
      setShowNewFolder(false)
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function createItem() {
    if (!newItem.name.trim()) return
    try {
      await apiFetch('/api/library/items', {
        method: 'POST',
        body: JSON.stringify({
          folder_id: folderId,
          name: newItem.name.trim(),
          kind: newItem.kind,
          url: newItem.url.trim() || null,
        }),
      })
      setNewItem({ name: '', kind: 'photo', url: '' })
      setShowNewItem(false)
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}" and all of its items?`)) return
    try {
      await apiFetch(`/api/library/folders/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}?`)) return
    try {
      await apiFetch('/api/library/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ item_ids: [...selected], op: 'delete' }),
      })
      setSelected(new Set())
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function bulkMove(targetId: string | null) {
    if (selected.size === 0) return
    try {
      await apiFetch('/api/library/items/bulk', {
        method: 'POST',
        body: JSON.stringify({
          item_ids: [...selected],
          op: 'move',
          target_folder_id: targetId,
        }),
      })
      setSelected(new Set())
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
        position: 'relative',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Library</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            {flat.length} folder{flat.length === 1 ? '' : 's'} ·{' '}
            {items.length} item{items.length === 1 ? '' : 's'} in this folder
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowNewFolder(true)} style={ghostBtn}>
            <FolderOpen size={14} /> New folder
          </button>
          <button onClick={() => setShowNewItem(true)} style={primaryBtn}>
            <Plus size={14} /> New item
          </button>
        </div>
      </header>

      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 14,
          fontSize: 13,
        }}
      >
        {folderId && (
          <button
            onClick={() => setFolderId(byId.get(folderId)?.parent_id ?? null)}
            style={{
              padding: 6,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
              color: 'rgba(240,242,248,0.7)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
            title="Up one level"
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <button
          onClick={() => setFolderId(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: folderId ? 'rgba(240,242,248,0.6)' : '#f0f2f8',
            cursor: 'pointer',
            font: 'inherit',
            padding: 4,
          }}
        >
          Library
        </button>
        {path.map((f) => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronRight size={14} color="rgba(240,242,248,0.3)" />
            <button
              onClick={() => setFolderId(f.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: f.id === folderId ? '#f0f2f8' : 'rgba(240,242,248,0.6)',
                cursor: 'pointer',
                font: 'inherit',
                padding: 4,
              }}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
          }}
        >
          <Search size={16} color="rgba(240,242,248,0.4)" />
          <input
            type="text"
            placeholder="Search this folder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 13,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            padding: 2,
          }}
        >
          <button
            onClick={() => setView('grid')}
            style={{
              padding: '6px 10px',
              background: view === 'grid' ? 'rgba(36,83,255,0.18)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              color: view === 'grid' ? '#f0f2f8' : 'rgba(240,242,248,0.5)',
              cursor: 'pointer',
            }}
          >
            <GridIcon size={16} />
          </button>
          <button
            onClick={() => setView('list')}
            style={{
              padding: '6px 10px',
              background: view === 'list' ? 'rgba(36,83,255,0.18)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              color: view === 'list' ? '#f0f2f8' : 'rgba(240,242,248,0.5)',
              cursor: 'pointer',
            }}
          >
            <ListIcon size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.3)',
            borderRadius: 8,
            color: '#fca5a5',
            marginBottom: 14,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading library…</div>
      )}

      {!loading && filteredFolders.length === 0 && filteredItems.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'rgba(240,242,248,0.5)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}
        >
          <FolderOpen size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {search ? 'No matches' : 'This folder is empty'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {search
              ? 'Try a different search term.'
              : 'Use New folder or New item to add content.'}
          </div>
        </div>
      )}

      {/* Folders + items */}
      {!loading && (filteredFolders.length > 0 || filteredItems.length > 0) && (
        <>
          {filteredFolders.length > 0 && (
            <Section label="Folders">
              <div
                style={{
                  display: view === 'grid' ? 'grid' : 'flex',
                  gridTemplateColumns: isPhone
                    ? 'repeat(2, 1fr)'
                    : 'repeat(auto-fill, minmax(180px, 1fr))',
                  flexDirection: view === 'grid' ? undefined : 'column',
                  gap: view === 'grid' ? 12 : 6,
                }}
              >
                {filteredFolders.map((f) =>
                  view === 'grid' ? (
                    <FolderTileGrid
                      key={f.id}
                      folder={f}
                      onOpen={() => setFolderId(f.id)}
                      onDelete={() => deleteFolder(f.id, f.name)}
                    />
                  ) : (
                    <FolderTileList
                      key={f.id}
                      folder={f}
                      onOpen={() => setFolderId(f.id)}
                      onDelete={() => deleteFolder(f.id, f.name)}
                    />
                  ),
                )}
              </div>
            </Section>
          )}

          {filteredItems.length > 0 && (
            <Section label="Items">
              <div
                style={{
                  display: view === 'grid' ? 'grid' : 'flex',
                  gridTemplateColumns: isPhone
                    ? 'repeat(2, 1fr)'
                    : 'repeat(auto-fill, minmax(180px, 1fr))',
                  flexDirection: view === 'grid' ? undefined : 'column',
                  gap: view === 'grid' ? 12 : 6,
                }}
              >
                {filteredItems.map((it) =>
                  view === 'grid' ? (
                    <ItemTileGrid
                      key={it.id}
                      item={it}
                      checked={selected.has(it.id)}
                      onToggle={() => toggle(it.id)}
                    />
                  ) : (
                    <ItemTileList
                      key={it.id}
                      item={it}
                      checked={selected.has(it.id)}
                      onToggle={() => toggle(it.id)}
                    />
                  ),
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 14,
            marginTop: 18,
            padding: '10px 14px',
            background: 'rgba(36,83,255,0.16)',
            border: '1px solid rgba(36,83,255,0.4)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backdropFilter: 'blur(10px)',
            zIndex: 5,
          }}
        >
          <strong style={{ fontSize: 13 }}>{selected.size} selected</strong>
          <select
            onChange={(e) => {
              const v = e.target.value
              if (v) {
                bulkMove(v === 'root' ? null : v)
                e.target.value = ''
              }
            }}
            defaultValue=""
            style={{
              padding: '6px 10px',
              background: 'rgba(15,15,20,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#f0f2f8',
              fontSize: 12,
            }}
          >
            <option value="" disabled>
              Move to…
            </option>
            <option value="root">Library (root)</option>
            {flat
              .filter((f) => f.id !== folderId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {'  '.repeat(f.depth)}
                  {f.name}
                </option>
              ))}
          </select>
          <button
            onClick={bulkDelete}
            style={{
              padding: '6px 12px',
              background: 'rgba(251,113,133,0.18)',
              border: '1px solid rgba(251,113,133,0.4)',
              borderRadius: 6,
              color: '#fca5a5',
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              marginLeft: 'auto',
              padding: 6,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.6)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <Modal title="New folder" onClose={() => setShowNewFolder(false)}>
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFolder()
              if (e.key === 'Escape') setShowNewFolder(false)
            }}
            placeholder="Folder name"
            style={modalInput}
          />
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)', marginTop: 6 }}>
            Will be created under{' '}
            <strong>{folderId ? byId.get(folderId)?.name : 'Library (root)'}</strong>
          </div>
          <ModalFooter
            onCancel={() => setShowNewFolder(false)}
            onConfirm={createFolder}
            confirmLabel="Create folder"
            disabled={!newFolderName.trim()}
          />
        </Modal>
      )}

      {/* New item modal */}
      {showNewItem && (
        <Modal title="New item" onClose={() => setShowNewItem(false)}>
          <Field label="Name">
            <input
              autoFocus
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Item name"
              style={modalInput}
            />
          </Field>
          <Field label="Kind">
            <select
              value={newItem.kind}
              onChange={(e) => setNewItem({ ...newItem, kind: e.target.value })}
              style={modalInput}
            >
              <option value="photo">Photo</option>
              <option value="document">Document</option>
              <option value="bim">BIM model</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="URL (optional)">
            <input
              value={newItem.url}
              onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
              placeholder="https://…"
              style={modalInput}
            />
          </Field>
          <ModalFooter
            onCancel={() => setShowNewItem(false)}
            onConfirm={createItem}
            confirmLabel="Add item"
            disabled={!newItem.name.trim()}
          />
        </Modal>
      )}
    </div>
  )
}

function flattenTree(tree: Folder[], depth = 0): Folder[] {
  const out: Folder[] = []
  for (const f of tree) {
    out.push({ ...f, depth })
    if (f.children) out.push(...flattenTree(f.children, depth + 1))
  }
  return out
}

function buildPath(id: string | null, byId: Map<string, Folder>): Folder[] {
  if (!id) return []
  const out: Folder[] = []
  let cur = byId.get(id) ?? null
  while (cur) {
    out.unshift(cur)
    cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null
  }
  return out
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.4)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function FolderTileGrid({
  folder,
  onOpen,
  onDelete,
}: {
  folder: Folder
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
      }}
      onClick={onOpen}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'rgba(36,83,255,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <FolderOpen size={22} color="#6385ff" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{folder.name}</div>
      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)' }}>Folder</div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        style={iconBtnHover}
        title="Delete folder"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function FolderTileList({
  folder,
  onOpen,
  onDelete,
}: {
  folder: Folder
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        cursor: 'pointer',
      }}
      onClick={onOpen}
    >
      <FolderOpen size={18} color="#6385ff" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{folder.name}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        style={iconBtn}
        title="Delete folder"
      >
        <Trash2 size={12} />
      </button>
      <ChevronRight size={14} color="rgba(240,242,248,0.3)" />
    </div>
  )
}

function ItemTileGrid({
  item,
  checked,
  onToggle,
}: {
  item: Item
  checked: boolean
  onToggle: () => void
}) {
  const Icon = KIND_ICON[item.kind] ?? FileIcon
  const color = KIND_COLOR[item.kind] ?? '#94a3b8'
  return (
    <div
      onClick={onToggle}
      style={{
        position: 'relative',
        background: checked ? 'rgba(36,83,255,0.10)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${checked ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 10, right: 10 }}
      />
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: color + '22',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <Icon size={22} color={color} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.name}</div>
      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)' }}>
        {item.kind} · {fmtBytes(item.size_bytes)}
      </div>
    </div>
  )
}

function ItemTileList({
  item,
  checked,
  onToggle,
}: {
  item: Item
  checked: boolean
  onToggle: () => void
}) {
  const Icon = KIND_ICON[item.kind] ?? FileIcon
  const color = KIND_COLOR[item.kind] ?? '#94a3b8'
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        background: checked ? 'rgba(36,83,255,0.10)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${checked ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <Icon size={18} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)' }}>
          {item.kind} · {fmtBytes(item.size_bytes)}
        </div>
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 11,
            color: 'rgba(240,242,248,0.5)',
            padding: 4,
          }}
        >
          Open
        </a>
      )}
    </label>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'rgba(240,242,248,0.5)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
      <button onClick={onCancel} style={ghostBtn}>
        Cancel
      </button>
      <button onClick={onConfirm} disabled={disabled} style={{ ...primaryBtn, opacity: disabled ? 0.5 : 1 }}>
        <FolderInput size={12} /> {confirmLabel}
      </button>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const iconBtn: React.CSSProperties = {
  padding: 6,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: 'rgba(240,242,248,0.5)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

const iconBtnHover: React.CSSProperties = {
  ...iconBtn,
  position: 'absolute',
  top: 10,
  right: 10,
}

const modalInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}
