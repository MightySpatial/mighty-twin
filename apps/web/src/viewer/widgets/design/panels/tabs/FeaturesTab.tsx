/**
 * FeaturesTab — tree / table browser for every node in the active sketch.
 *
 * Tree mode groups by sketch layer (collapsible chevron headers, geometry
 * icon per node, inline rename via double-click). Table mode is a flat
 * spreadsheet view: built-in cols (id, name, type, geom, layer) plus a
 * column for every attribute key seen across the visible nodes.
 *
 * Selection — click for single, shift-click extends a range over the
 * current flat order, cmd/ctrl-click toggles. The footer surfaces bulk
 * delete and "Move to layer …" actions whenever the selection set is
 * non-empty.
 *
 * Drag-drop — every row has a drag handle. Dropping on a layer header
 * (tree) or a layer cell (table) moves the dragged node(s) into that
 * layer via `updateNodeParam({ sketchLayer })`.
 *
 * CSV import — table mode only. Pick a CSV whose first column matches
 * `id` or `name`; remaining columns become attribute updates. The diff
 * preview lists every row × field that would change (with old → new
 * values) before any mutation lands.
 */
import { useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, FileUp, GripVertical, Trash2,
} from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import ToggleGroup from '../../primitives/ToggleGroup'
import type { NodeType, SketchLayerSpec, SketchNode } from '../../sketch/types'

type ViewMode = 'tree' | 'table'

const SOLID_TYPES: NodeType[] = ['box', 'pit', 'cylinder', 'extrude']

// Built-in (non-attribute) columns rendered in table view, in order.
const BUILTIN_COLS = ['name', 'type', 'geom', 'layer'] as const

// Drag-payload mime — keeps this widget's drops from being mistaken for
// random text drops elsewhere on the page.
const DRAG_MIME = 'application/x-mtwin-design-nodes'

interface CsvRow { key: string; values: Record<string, string> }
interface CsvDiff {
  matchField: 'id' | 'name' | string
  attrCols: string[]
  /** Per-row changes: undefined when the row matches no node. */
  rows: Array<{
    csvKey: string
    nodeId: string | null
    nodeLabel: string
    /** Empty when the row would not change anything. */
    changes: Array<{ field: string; oldVal: string; newVal: string }>
  }>
}

export default function FeaturesTab() {
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const selectNode = useCadEngine(s => s.selectNode)
  const removeNode = useCadEngine(s => s.removeNode)
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)

  const [view, setView] = useState<ViewMode>('tree')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameDraft, setEditingNameDraft] = useState('')
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null)
  const [bulkLayerPickerOpen, setBulkLayerPickerOpen] = useState(false)
  const [csvDiff, setCsvDiff] = useState<CsvDiff | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)

  const csvInputRef = useRef<HTMLInputElement | null>(null)

  const sketch = activeSketchId ? sketches[activeSketchId] : null

  // Flat list in stable layer order so shift-range works predictably.
  const flat = useMemo<SketchNode[]>(() => {
    if (!sketch) return []
    const inSketch = Object.values(nodes).filter(
      n => n.params.sketchId === sketch.id,
    )
    const layerOrder = new Map(sketch.layers.map((l, i) => [l.id, i]))
    return inSketch.sort((a, b) => {
      const la = layerOrder.get(a.params.sketchLayer ?? '') ?? 999
      const lb = layerOrder.get(b.params.sketchLayer ?? '') ?? 999
      if (la !== lb) return la - lb
      return a.id.localeCompare(b.id)
    })
  }, [sketch, nodes])

  const grouped = useMemo<Array<{ layer: SketchLayerSpec | null; rows: SketchNode[] }>>(() => {
    if (!sketch) return []
    const byLayer = new Map<string, SketchNode[]>()
    for (const layer of sketch.layers) byLayer.set(layer.id, [])
    const orphans: SketchNode[] = []
    for (const n of flat) {
      const lid = n.params.sketchLayer
      if (lid && byLayer.has(lid)) byLayer.get(lid)!.push(n)
      else orphans.push(n)
    }
    const out: Array<{ layer: SketchLayerSpec | null; rows: SketchNode[] }> =
      sketch.layers.map(layer => ({ layer, rows: byLayer.get(layer.id) ?? [] }))
    if (orphans.length) out.push({ layer: null, rows: orphans })
    return out
  }, [sketch, flat])

  const attrCols = useMemo<string[]>(() => {
    const keys = new Set<string>()
    for (const n of flat) {
      for (const k of Object.keys(n.attributes ?? {})) keys.add(k)
    }
    keys.delete('name')
    return [...keys].sort()
  }, [flat])

  if (!sketch) {
    return (
      <div className="features-tab__empty">
        <p>No active sketch.</p>
      </div>
    )
  }

  // ── Selection helpers ─────────────────────────────────────────────
  function handleRowClick(nodeId: string, e: React.MouseEvent) {
    if (e.shiftKey && anchorId) {
      const ids = flat.map(n => n.id)
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(nodeId)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const next = new Set(selection)
        for (let i = lo; i <= hi; i++) next.add(ids[i])
        setSelection(next)
        selectNode(nodeId)
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selection)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      setSelection(next)
      setAnchorId(nodeId)
      selectNode(next.size === 1 ? [...next][0] : null)
      return
    }
    // Plain click — replace selection.
    const single = selectedNodeId === nodeId && selection.size <= 1
    const next = single ? new Set<string>() : new Set([nodeId])
    setSelection(next)
    setAnchorId(single ? null : nodeId)
    selectNode(single ? null : nodeId)
  }

  function clearSelection() {
    setSelection(new Set())
    setAnchorId(null)
  }

  // ── Bulk ops ──────────────────────────────────────────────────────
  function bulkDelete() {
    const ids = [...selection]
    for (const id of ids) removeNode(id)
    clearSelection()
  }

  function bulkMoveToLayer(layerId: string) {
    for (const id of selection) updateNodeParam(id, { sketchLayer: layerId })
    setBulkLayerPickerOpen(false)
  }

  // ── Inline rename ────────────────────────────────────────────────
  function startRename(node: SketchNode) {
    setEditingNameId(node.id)
    setEditingNameDraft(
      ((node.attributes.name as string | undefined)
        ?? (node.attributes.label as string | undefined)
        ?? '').toString(),
    )
  }
  function commitRename() {
    if (editingNameId) {
      const trimmed = editingNameDraft.trim()
      updateNodeAttributes(editingNameId, { name: trimmed || undefined })
    }
    setEditingNameId(null)
  }

  // ── Drag-drop ────────────────────────────────────────────────────
  function onRowDragStart(e: React.DragEvent, nodeId: string) {
    // If the dragged row is part of a multi-selection, drag the whole set.
    const ids = selection.has(nodeId) && selection.size > 1
      ? [...selection] : [nodeId]
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids))
    // Surface a generic text fallback — some browsers blank the drag
    // image if no text/plain payload is present.
    e.dataTransfer.setData('text/plain', ids.join(','))
  }
  function onLayerDragOver(e: React.DragEvent, layerId: string) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverLayerId(layerId)
  }
  function onLayerDragLeave(layerId: string) {
    setDragOverLayerId(prev => (prev === layerId ? null : prev))
  }
  function onLayerDrop(e: React.DragEvent, layerId: string) {
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    e.preventDefault()
    setDragOverLayerId(null)
    try {
      const ids = JSON.parse(raw) as string[]
      for (const id of ids) updateNodeParam(id, { sketchLayer: layerId })
    } catch { /* malformed drop — ignore */ }
  }

  // ── CSV import + diff ────────────────────────────────────────────
  function openCsvPicker() {
    setCsvError(null)
    csvInputRef.current?.click()
  }
  async function onCsvFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length === 0 || !parsed[0].values) {
        setCsvError('CSV is empty or has no header row.')
        return
      }
      const header = Object.keys(parsed[0].values)
      // First column = match key. Field after that = attribute updates.
      const matchHeader = header[0] ?? ''
      const matchField: 'id' | 'name' | string =
        matchHeader.toLowerCase() === 'id' ? 'id'
        : matchHeader.toLowerCase() === 'name' ? 'name'
        : matchHeader
      const attrColumns = header.slice(1)
      if (attrColumns.length === 0) {
        setCsvError('CSV needs at least one attribute column after the key column.')
        return
      }
      const diff: CsvDiff = {
        matchField,
        attrCols: attrColumns,
        rows: parsed.map(row => {
          const csvKey = row.key
          const node = matchNode(flat, matchField, csvKey)
          const changes: Array<{ field: string; oldVal: string; newVal: string }> = []
          if (node) {
            for (const col of attrColumns) {
              const newVal = row.values[col] ?? ''
              const old = node.attributes[col]
              const oldVal = old == null ? '' : String(old)
              if (oldVal !== newVal) {
                changes.push({ field: col, oldVal, newVal })
              }
            }
          }
          return {
            csvKey,
            nodeId: node?.id ?? null,
            nodeLabel: node ? labelOf(node) : '—',
            changes,
          }
        }),
      }
      setCsvDiff(diff)
    } catch (err) {
      setCsvError((err as Error).message || 'Failed to parse CSV.')
    }
  }
  function applyCsvDiff() {
    if (!csvDiff) return
    for (const row of csvDiff.rows) {
      if (!row.nodeId || row.changes.length === 0) continue
      const patch: Record<string, unknown> = {}
      for (const ch of row.changes) patch[ch.field] = ch.newVal
      updateNodeAttributes(row.nodeId, patch)
    }
    setCsvDiff(null)
  }

  // ── Render ───────────────────────────────────────────────────────
  const selectionCount = selection.size

  return (
    <div className="features-tab" onKeyDown={e => {
      if (e.key === 'Escape') {
        clearSelection()
        setBulkLayerPickerOpen(false)
      }
    }}>
      <div className="features-tab__toolbar">
        <ToggleGroup<ViewMode>
          value={view}
          onChange={setView}
          options={[
            { value: 'tree',  label: 'Tree' },
            { value: 'table', label: 'Table' },
          ]}
        />
        {view === 'table' && (
          <button
            className="features-csv-btn"
            onClick={openCsvPicker}
            title="Import CSV — preview attribute updates before applying"
          >
            <FileUp size={13} /> CSV
          </button>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={onCsvFileChosen}
        />
      </div>

      <div className="features-count">
        {flat.length} feature{flat.length === 1 ? '' : 's'}
        {selectionCount > 0 && (
          <span className="features-count__sel"> · {selectionCount} selected</span>
        )}
      </div>

      {csvError && <div className="features-csv-err">{csvError}</div>}

      {/* ── Tree view ───────────────────────────────────────────── */}
      {view === 'tree' && (
        <div className="features-tree">
          {grouped.map(({ layer, rows }) => {
            const layerId = layer?.id ?? '__orphan__'
            const isCollapsed = collapsed.has(layerId)
            const isDragOver = dragOverLayerId === layerId
            return (
              <div key={layerId} className="features-layer-group">
                <div
                  className={
                    'features-layer-header'
                    + (isDragOver ? ' is-drag-over' : '')
                  }
                  onClick={() => {
                    const next = new Set(collapsed)
                    if (next.has(layerId)) next.delete(layerId)
                    else next.add(layerId)
                    setCollapsed(next)
                  }}
                  onDragOver={e => layer && onLayerDragOver(e, layer.id)}
                  onDragLeave={() => layer && onLayerDragLeave(layer.id)}
                  onDrop={e => layer && onLayerDrop(e, layer.id)}
                >
                  <span className="features-layer-chevron">
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </span>
                  <span
                    className="features-layer-dot"
                    style={layer ? { background: layer.colour } : { background: 'transparent', border: '1px dashed currentColor' }}
                  />
                  <span className="features-layer-name">{layer?.name ?? 'Unassigned'}</span>
                  <span className="features-layer-count">{rows.length}</span>
                </div>
                {!isCollapsed && (
                  <ul className="features-tree-list">
                    {rows.map(node => {
                      const isSel = selection.has(node.id) || selectedNodeId === node.id
                      const isEditing = editingNameId === node.id
                      const label = labelOf(node)
                      return (
                        <li
                          key={node.id}
                          className={'features-tree-item' + (isSel ? ' is-selected' : '')}
                          onClick={e => handleRowClick(node.id, e)}
                          onDoubleClick={e => {
                            // Avoid re-firing on the inner input.
                            if ((e.target as HTMLElement).tagName === 'INPUT') return
                            startRename(node)
                          }}
                          draggable={!isEditing}
                          onDragStart={e => onRowDragStart(e, node.id)}
                        >
                          <span className="features-drag-handle" title="Drag to another layer">
                            <GripVertical size={12} />
                          </span>
                          <span
                            className="features-geom-icon"
                            style={layer ? { color: layer.colour } : undefined}
                          >
                            {geomIcon(node)}
                          </span>
                          {isEditing ? (
                            <input
                              className="features-rename-input"
                              autoFocus
                              value={editingNameDraft}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditingNameDraft(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename()
                                if (e.key === 'Escape') setEditingNameId(null)
                              }}
                            />
                          ) : (
                            <span className="features-tree-label">{label}</span>
                          )}
                          <span
                            className="geometry-badge"
                            data-geom={node.params.geometry || (SOLID_TYPES.includes(node.type) ? 'box' : '')}
                          >{node.type}</span>
                          <button
                            className="features-row-del"
                            title="Delete (cascades downstream)"
                            onClick={e => { e.stopPropagation(); removeNode(node.id) }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      )
                    })}
                    {rows.length === 0 && (
                      <li className="features-tree-empty">No features in this layer</li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Table view ──────────────────────────────────────────── */}
      {view === 'table' && (
        <div className="features-table-wrap">
          <table className="features-table">
            <thead>
              <tr>
                <th className="ft-col-handle" />
                <th className="ft-col-id">id</th>
                {BUILTIN_COLS.map(c => <th key={c} className={`ft-col-${c}`}>{c}</th>)}
                {attrCols.map(c => <th key={c} className="ft-col-attr">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {flat.map(node => {
                const layer = sketch.layers.find(l => l.id === node.params.sketchLayer)
                const isSel = selection.has(node.id) || selectedNodeId === node.id
                const isEditing = editingNameId === node.id
                return (
                  <tr
                    key={node.id}
                    className={isSel ? 'is-selected' : ''}
                    onClick={e => handleRowClick(node.id, e)}
                    draggable={!isEditing}
                    onDragStart={e => onRowDragStart(e, node.id)}
                  >
                    <td className="ft-col-handle">
                      <span className="features-drag-handle" title="Drag to another layer">
                        <GripVertical size={12} />
                      </span>
                    </td>
                    <td className="ft-col-id"><code>{node.id}</code></td>
                    <td
                      className="ft-col-name"
                      onDoubleClick={e => {
                        if ((e.target as HTMLElement).tagName === 'INPUT') return
                        startRename(node)
                      }}
                    >
                      {isEditing ? (
                        <input
                          className="features-rename-input"
                          autoFocus
                          value={editingNameDraft}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setEditingNameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setEditingNameId(null)
                          }}
                        />
                      ) : labelOf(node)}
                    </td>
                    <td className="ft-col-type">{node.type}</td>
                    <td className="ft-col-geom">
                      {node.params.geometry ?? (SOLID_TYPES.includes(node.type) ? 'solid' : '—')}
                    </td>
                    <td
                      className={'ft-col-layer' + (dragOverLayerId === (layer?.id ?? '') ? ' is-drag-over' : '')}
                      onDragOver={e => layer && onLayerDragOver(e, layer.id)}
                      onDragLeave={() => layer && onLayerDragLeave(layer.id)}
                      onDrop={e => layer && onLayerDrop(e, layer.id)}
                    >
                      {layer
                        ? <><span className="features-layer-dot" style={{ background: layer.colour }} />{layer.name}</>
                        : <span className="features-layer-name features-layer-name--orphan">Unassigned</span>}
                    </td>
                    {attrCols.map(c => {
                      const v = node.attributes[c]
                      return <td key={c} className="ft-col-attr">{v == null ? '' : String(v)}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Selection footer (bulk delete + move-to-layer) ──────── */}
      {selectionCount > 0 && (
        <div className="features-selection-bar">
          <span className="features-selection-count">{selectionCount} selected</span>
          <button className="ae-save-cancel" onClick={clearSelection}>Clear</button>
          <button
            className="ae-save-cancel"
            onClick={() => setBulkLayerPickerOpen(v => !v)}
          >
            Move to layer …
          </button>
          <button className="features-bulk-del" onClick={bulkDelete}>
            <Trash2 size={12} /> Delete
          </button>
          {bulkLayerPickerOpen && (
            <div className="features-layer-picker">
              {sketch.layers.map(l => (
                <button
                  key={l.id}
                  className="features-layer-pick"
                  onClick={() => bulkMoveToLayer(l.id)}
                >
                  <span className="features-layer-dot" style={{ background: l.colour }} />
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CSV diff modal ──────────────────────────────────────── */}
      {csvDiff && (
        <CsvDiffModal
          diff={csvDiff}
          onCancel={() => setCsvDiff(null)}
          onApply={applyCsvDiff}
        />
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function labelOf(n: SketchNode): string {
  return ((n.attributes.name as string | undefined)
    ?? (n.attributes.label as string | undefined)
    ?? `${n.type}_${n.id.slice(-4)}`)
}

function geomIcon(n: SketchNode): string {
  if (n.params.geometry === 'point') return '●'
  if (n.params.geometry === 'line') return '╱'
  if (n.params.geometry === 'polygon') return '⬡'
  if (n.type === 'box') return '▭'
  if (n.type === 'cylinder') return '◯'
  if (n.type === 'pit') return '▽'
  if (n.type === 'extrude' || n.type === 'loft') return '◧'
  if (n.type === 'pipe') return '═'
  return '◇'
}

function matchNode(
  list: SketchNode[],
  field: 'id' | 'name' | string,
  key: string,
): SketchNode | undefined {
  if (!key) return undefined
  if (field === 'id') return list.find(n => n.id === key)
  if (field === 'name') {
    return list.find(n =>
      ((n.attributes.name as string | undefined) ?? '') === key
      || ((n.attributes.label as string | undefined) ?? '') === key,
    )
  }
  return list.find(n => {
    const v = n.attributes[field]
    return v != null && String(v) === key
  })
}

/** Minimal CSV parser — handles quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): CsvRow[] {
  const lines = splitCsvLines(text.replace(/\r\n/g, '\n'))
  if (lines.length < 2) return []
  const header = parseCsvLine(lines[0])
  const out: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseCsvLine(lines[i])
    const values: Record<string, string> = {}
    for (let j = 0; j < header.length; j++) values[header[j]] = cells[j] ?? ''
    out.push({ key: cells[0] ?? '', values })
  }
  return out
}

function splitCsvLines(text: string): string[] {
  const out: string[] = []
  let buf = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { buf += '""'; i++; continue }
      if (c === '"') { inQuote = false; buf += c; continue }
      buf += c
      continue
    }
    if (c === '"') { inQuote = true; buf += c; continue }
    if (c === '\n') { out.push(buf); buf = ''; continue }
    buf += c
  }
  if (buf.length) out.push(buf)
  return out
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; continue }
      if (c === '"') { inQuote = false; continue }
      cell += c
      continue
    }
    if (c === '"') { inQuote = true; continue }
    if (c === ',') { out.push(cell); cell = ''; continue }
    cell += c
  }
  out.push(cell)
  return out
}

// ── CSV diff modal ──────────────────────────────────────────────────

interface CsvDiffModalProps {
  diff: CsvDiff
  onCancel: () => void
  onApply: () => void
}

function CsvDiffModal({ diff, onCancel, onApply }: CsvDiffModalProps) {
  const matched = diff.rows.filter(r => r.nodeId).length
  const unmatched = diff.rows.length - matched
  const changedRows = diff.rows.filter(r => r.nodeId && r.changes.length > 0)
  const totalChanges = changedRows.reduce((n, r) => n + r.changes.length, 0)

  return (
    <div className="dw-modal-backdrop" onClick={onCancel}>
      <div className="dw-modal csv-diff-modal" onClick={e => e.stopPropagation()}>
        <div className="dw-modal__hd">
          <h3>CSV import preview</h3>
          <button className="dw-modal__close" onClick={onCancel}>×</button>
        </div>
        <div className="dw-modal__body">
          <p className="dw-modal__hint">
            Match key — <strong>{diff.matchField}</strong>.
            {' '}{matched} matched · {unmatched} unmatched · {totalChanges} field change{totalChanges === 1 ? '' : 's'}.
          </p>

          {totalChanges === 0 && (
            <p className="features-csv-empty">
              Nothing to apply — every row either has no match or no value
              changes.
            </p>
          )}

          {changedRows.length > 0 && (
            <div className="csv-diff-list">
              {changedRows.map(row => (
                <div key={row.csvKey} className="csv-diff-row">
                  <div className="csv-diff-row__hd">
                    <span className="csv-diff-row__node">{row.nodeLabel}</span>
                    <span className="csv-diff-row__key">{row.csvKey}</span>
                  </div>
                  {row.changes.map(ch => (
                    <div key={ch.field} className="csv-diff-change">
                      <span className="csv-diff-field">{ch.field}</span>
                      <span className="csv-diff-old">{ch.oldVal || <em>∅</em>}</span>
                      <span className="csv-diff-arr">→</span>
                      <span className="csv-diff-new">{ch.newVal || <em>∅</em>}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {unmatched > 0 && (
            <details className="csv-diff-unmatched">
              <summary>{unmatched} unmatched row{unmatched === 1 ? '' : 's'}</summary>
              <ul>
                {diff.rows.filter(r => !r.nodeId).map(r => (
                  <li key={r.csvKey}><code>{r.csvKey || '(empty)'}</code></li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="dw-modal__actions">
          <button className="ae-save-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="ae-save-ok"
            onClick={onApply}
            disabled={totalChanges === 0}
          >
            Apply {totalChanges > 0 ? `(${totalChanges})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
