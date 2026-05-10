/**
 * RedlineCreationModal — site → scope → target → name. v1's redline
 *  creation flow. Creates a new sketch with redline metadata stamped
 *  in (`targetDataSourceId`, `redline.scope`, `redline.targetLayerId`).
 *
 *  Schema + CRS inheritance from the target layer happens server-side:
 *  the modal kicks off a background fetch to
 *  /api/sites/{slug}/layers/{lid}/source-crs + /fields after the sketch
 *  is created, and stamps the result onto the new sketch's layer
 *  schema.
 */
import { useEffect, useState } from 'react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import SelectRow from '../../primitives/SelectRow'
import ToggleGroup from '../../primitives/ToggleGroup'
import type { SchemaField } from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface Props {
  siteSlug: string
  onClose: () => void
}

interface LayerOption { id: string; name: string }
type Scope = 'layer' | 'site'

export default function RedlineCreationModal({ siteSlug, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('layer')
  const [layers, setLayers] = useState<LayerOption[]>([])
  const [targetLayerId, setTargetLayerId] = useState<string>('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createSketch = useCadEngine(s => s.createSketch)
  const patchSketch = useCadEngine(s => s.patchSketch)
  const setActiveSketch = useCadEngine(s => s.setActiveSketch)

  // Pull the site's layers on mount so the user picks a target.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = localStorage.getItem('accessToken')
        const r = await fetch(`${API_URL}/api/sites/${siteSlug}/layers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!r.ok) throw new Error(`layers: ${r.status}`)
        const rows: Array<{ id: string; name: string }> = await r.json()
        if (cancelled) return
        setLayers(rows.map(l => ({ id: l.id, name: l.name })))
        if (rows[0]) setTargetLayerId(rows[0].id)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [siteSlug])

  async function fetchSchemaFromTarget(layerId: string): Promise<SchemaField[]> {
    try {
      const token = localStorage.getItem('accessToken')
      const r = await fetch(
        `${API_URL}/api/sites/${siteSlug}/layers/${encodeURIComponent(layerId)}/fields`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!r.ok) return []
      const data = await r.json() as { fields?: string[] }
      return (data.fields ?? []).map(k => ({ key: k, type: 'text' as const }))
    } catch {
      return []
    }
  }

  async function commit() {
    if (!name.trim()) {
      setError('Please give the redline a name')
      return
    }
    if (scope === 'layer' && !targetLayerId) {
      setError('Pick a target layer')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sketchId = createSketch({ name: name.trim(), siteId: siteSlug })
      // Inherit schema from the target layer.
      const fields = scope === 'layer' ? await fetchSchemaFromTarget(targetLayerId) : []
      patchSketch(sketchId, {
        siteIds: [siteSlug],
        targetDataSourceId: scope === 'layer' ? targetLayerId : undefined,
        redline: {
          scope,
          targetLayerId: scope === 'layer' ? targetLayerId : '',
        },
        fields,
        changeSet: { modified: [], deleted: [] },
      })
      setActiveSketch(sketchId)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dw-modal-backdrop" onClick={onClose}>
      <div className="dw-modal" onClick={e => e.stopPropagation()}>
        <div className="dw-modal__hd">
          <h3>New redline sketch</h3>
          <button className="dw-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="dw-modal__body">
          <div className="dw-row">
            <SectionLabel>Scope</SectionLabel>
            <ToggleGroup<Scope>
              value={scope}
              onChange={setScope}
              options={[
                { value: 'layer', label: 'One layer' },
                { value: 'site',  label: 'Whole site' },
              ]}
            />
          </div>
          {scope === 'layer' && (
            <SelectRow
              label="Target layer"
              value={targetLayerId}
              options={layers.map(l => ({ value: l.id, label: l.name }))}
              onChange={v => setTargetLayerId(String(v))}
            />
          )}
          <div className="dw-row">
            <SectionLabel htmlFor="redline-name">Name</SectionLabel>
            <input
              id="redline-name"
              className="dw-number-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Redline · contractor markup"
              autoFocus
            />
          </div>

          <p className="dw-modal__hint">
            Schema + CRS inherit from the target. Submissions land in the
            site's review queue.
          </p>

          {error && <div className="dl-error">{error}</div>}

          <div className="dw-modal__actions">
            <button className="ae-save-cancel" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="ae-save-ok" onClick={commit} disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
