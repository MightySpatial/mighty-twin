/**
 * HistoryTab — DAG history list with By-Layer / By-Type view modes,
 * live-history toggle + Rebuild button.
 */
import { useMemo, useState } from 'react'
import { useCadEngine } from '../../sketch/useCadEngine'
import ToggleGroup from '../../primitives/ToggleGroup'
import type { GeometryKind } from '../../sketch/types'

type ViewMode = 'layer' | 'type'

const GEOM_GROUPS: Record<GeometryKind, string> = {
  point: 'Points',
  line: 'Lines',
  polygon: 'Polygons',
  other: 'Other',
}

export default function HistoryTab() {
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const liveHistory = useCadEngine(s => s.liveHistoryEnabled)
  const setLiveHistory = useCadEngine(s => s.setLiveHistory)
  const rebuild = useCadEngine(s => s.rebuild)
  const staleNodeIds = useCadEngine(s => s.staleNodeIds)
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const selectNode = useCadEngine(s => s.selectNode)

  const [view, setView] = useState<ViewMode>('layer')
  const sketch = activeSketchId ? sketches[activeSketchId] : null

  const features = useMemo(() => {
    if (!sketch) return []
    return Object.values(nodes).filter(n => n.params.sketchId === sketch.id)
  }, [sketch, nodes])

  const byLayer = useMemo(() => {
    const map = new Map<string, typeof features>()
    if (!sketch) return map
    for (const layer of sketch.layers) map.set(layer.id, [])
    for (const f of features) {
      const lid = f.params.sketchLayer ?? ''
      if (!map.has(lid)) map.set(lid, [])
      map.get(lid)!.push(f)
    }
    return map
  }, [sketch, features])

  const byType = useMemo(() => {
    const map: Record<GeometryKind, typeof features> = { point: [], line: [], polygon: [], other: [] }
    for (const f of features) {
      const k = (f.params.geometry ?? 'other') as GeometryKind
      map[k].push(f)
    }
    return map
  }, [features])

  if (!sketch) return <div className="design-history-empty">No active sketch.</div>

  return (
    <div className="design-history">
      <div className="history-toolbar">
        <label className="ch-toggle">
          <input type="checkbox" checked={liveHistory} onChange={e => setLiveHistory(e.target.checked)} />
          <span>Live history</span>
        </label>
        {!liveHistory && staleNodeIds.size > 0 && (
          <button className="ae-save-ok" onClick={rebuild}>
            ⟳ Rebuild ({staleNodeIds.size})
          </button>
        )}
      </div>

      <ToggleGroup<ViewMode>
        value={view}
        onChange={setView}
        options={[
          { value: 'layer', label: 'By Layer' },
          { value: 'type', label: 'By Type' },
        ]}
      />

      {view === 'layer' && sketch.layers.map(layer => {
        const list = byLayer.get(layer.id) ?? []
        if (list.length === 0) return null
        return (
          <div key={layer.id} className="design-layer-group">
            <div className="design-layer-header">
              <span className="design-layer-dot" style={{ background: layer.colour }} />
              <span className="design-layer-name">{layer.name}</span>
              <span className="design-layer-count">{list.length}</span>
            </div>
            <ul className="design-feature-list">
              {list.map(n => (
                <li
                  key={n.id}
                  className={`design-feature-item${selectedNodeId === n.id ? ' selected' : ''}`}
                  onClick={() => selectNode(selectedNodeId === n.id ? null : n.id)}
                >
                  <span className="design-feature-label">{(n.attributes.name as string) || n.id}</span>
                  <span className="design-feature-geom">{n.type}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {view === 'type' && (Object.keys(GEOM_GROUPS) as GeometryKind[]).map(kind => {
        const list = byType[kind]
        if (list.length === 0) return null
        return (
          <div key={kind} className="design-layer-group">
            <div className="design-layer-header">
              <span className="design-layer-name">{GEOM_GROUPS[kind]}</span>
              <span className="design-layer-count">{list.length}</span>
            </div>
            <ul className="design-feature-list">
              {list.map(n => (
                <li
                  key={n.id}
                  className={`design-feature-item${selectedNodeId === n.id ? ' selected' : ''}`}
                  onClick={() => selectNode(selectedNodeId === n.id ? null : n.id)}
                >
                  <span className="design-feature-label">{(n.attributes.name as string) || n.id}</span>
                  <span className="design-feature-geom">{n.type}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
