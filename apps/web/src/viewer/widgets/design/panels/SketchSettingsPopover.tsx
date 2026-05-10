/**
 * SketchSettingsPopover — gear-icon dropdown on the active sketch tile.
 *
 * Per V1_SPEC.md §5: "Sketch settings popover (CRS, datum, site
 * affinity, download/duplicate/delete)". The popover is anchored under
 * the gear button; it edits the active sketch's `coordCrs`,
 * `heightDatum`, and `siteIds[]`, plus three terminal actions.
 *
 * Site affinity is shown as a comma-separated list (read-only display
 * of all current bindings + a free-form input for adding/removing) so
 * we don't have to call `/api/sites` from inside the design widget;
 * the active site is always implied via the rail. Power users can
 * extend the list manually.
 */
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Trash2 } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import SectionLabel from '../primitives/SectionLabel'
import SelectRow from '../primitives/SelectRow'
import type { Sketch } from '../sketch/types'

const CRS_OPTIONS = [
  { value: 'EPSG:4326',  label: 'WGS84 (EPSG:4326)' },
  { value: 'EPSG:7855',  label: 'GDA2020 / MGA Zone 55 (EPSG:7855)' },
  { value: 'EPSG:7856',  label: 'GDA2020 / MGA Zone 56 (EPSG:7856)' },
  { value: 'EPSG:7849',  label: 'GDA2020 / MGA Zone 49 (EPSG:7849)' },
  { value: 'EPSG:7850',  label: 'GDA2020 / MGA Zone 50 (EPSG:7850)' },
  { value: 'EPSG:7851',  label: 'GDA2020 / MGA Zone 51 (EPSG:7851)' },
  { value: 'EPSG:7852',  label: 'GDA2020 / MGA Zone 52 (EPSG:7852)' },
  { value: 'EPSG:7853',  label: 'GDA2020 / MGA Zone 53 (EPSG:7853)' },
  { value: 'EPSG:7854',  label: 'GDA2020 / MGA Zone 54 (EPSG:7854)' },
  { value: 'EPSG:2193',  label: 'NZTM 2000 (EPSG:2193)' },
  { value: 'local',      label: 'Local (custom origin)' },
]

const DATUM_OPTIONS: { value: Sketch['heightDatum']; label: string }[] = [
  { value: 'msl',         label: 'Mean sea level (MSL)' },
  { value: 'ahd',         label: 'Australian Height Datum (AHD)' },
  { value: 'ellipsoidal', label: 'Ellipsoidal' },
  { value: 'terrain',     label: 'Terrain-relative' },
]

interface Props {
  sketch: Sketch
  onClose: () => void
}

export default function SketchSettingsPopover({ sketch, onClose }: Props) {
  const patchSketch = useCadEngine(s => s.patchSketch)
  const deleteSketch = useCadEngine(s => s.deleteSketch)
  const duplicateSketch = useCadEngine(s => s.duplicateSketch)
  const nodes = useCadEngine(s => s.nodes)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [siteAffinity, setSiteAffinity] = useState(sketch.siteIds.join(', '))
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside dismiss. Skip the gear button itself so its toggling
  // onClick wins (otherwise the doc listener closes us first, then the
  // gear's handler reopens).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      const t = e.target as HTMLElement | null
      if (!t) return
      if (ref.current.contains(t)) return
      if (t.closest('.sketch-tile__gear')) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function commitSites() {
    const next = siteAffinity
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (next.length === 0) return
    if (next.join(',') === sketch.siteIds.join(',')) return
    patchSketch(sketch.id, { siteIds: next })
  }

  function downloadSketchJson() {
    const sketchNodes = Object.values(nodes).filter(
      n => n.params.sketchId === sketch.id,
    )
    const payload = {
      version: 2 as const,
      siteId: sketch.siteIds[0] ?? null,
      sketchId: sketch.id,
      sketch,
      nodes: sketchNodes,
      savedAt: Date.now(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sketch.name.replace(/[^a-zA-Z0-9_-]+/g, '-')}.sketch.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleDuplicate() {
    duplicateSketch(sketch.id)
    onClose()
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteSketch(sketch.id)
    onClose()
  }

  return (
    <div ref={ref} className="dw-sketch-settings" onClick={e => e.stopPropagation()}>
      <div className="dw-sketch-settings__hd">Sketch settings</div>

      <div className="dw-sketch-settings__body">
        <SelectRow
          label="Coordinate system"
          value={sketch.coordCrs}
          options={CRS_OPTIONS}
          onChange={v => patchSketch(sketch.id, { coordCrs: String(v) })}
        />

        <SelectRow<Sketch['heightDatum']>
          label="Height datum"
          value={sketch.heightDatum}
          options={DATUM_OPTIONS}
          onChange={v => patchSketch(sketch.id, { heightDatum: v })}
        />

        <div className="dw-row">
          <SectionLabel htmlFor={`sketch-sites-${sketch.id}`}>
            Site affinity
          </SectionLabel>
          <input
            id={`sketch-sites-${sketch.id}`}
            className="dw-number-input"
            value={siteAffinity}
            placeholder="site_a, site_b"
            onChange={e => setSiteAffinity(e.target.value)}
            onBlur={commitSites}
            onKeyDown={e => { if (e.key === 'Enter') commitSites() }}
          />
        </div>
        <p className="dw-modal__hint">
          Comma-separated site slugs. The sketch is visible on each.
        </p>
      </div>

      <div className="dw-sketch-settings__actions">
        <button className="dw-sketch-action" onClick={handleDuplicate}>
          <Copy size={13} /> Duplicate
        </button>
        <button className="dw-sketch-action" onClick={downloadSketchJson}>
          <Download size={13} /> Download JSON
        </button>
        <button
          className={`dw-sketch-action dw-sketch-action--danger${confirmDelete ? ' is-confirm' : ''}`}
          onClick={handleDelete}
        >
          <Trash2 size={13} /> {confirmDelete ? 'Click again to confirm' : 'Delete sketch'}
        </button>
      </div>
    </div>
  )
}
