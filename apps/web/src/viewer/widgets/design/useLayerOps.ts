/**
 * MightyTwin — Layer Operations Hook
 * Manages sketch layers: CRUD, visibility, locking, collapse, and colour propagation.
 */
import { useState, useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { SketchLayer, SketchFeature } from './types'
import { applyStyleToEntity } from './tools/designStyleUtils'

function makeLayerId(): string {
  return 'lyr_' + Math.random().toString(36).slice(2, 9)
}

export function makeSketchLayer(name: string, colour: string, order: number): SketchLayer {
  return {
    id: makeLayerId(),
    name,
    colour: colour || '#94a3b8',
    visible: true,
    locked: false,
    order,
    coordMode: 'world',
    fields: [{ id: 1, key: 'OBJECTID', type: 'number', defaultVal: '', auto: true }],
  }
}

export function useLayerOps(
  viewer: CesiumViewerType | null,
  setFeatures: Dispatch<SetStateAction<SketchFeature[]>>,
) {
  const [layers, setLayers] = useState<SketchLayer[]>([
    makeSketchLayer('Default Layer', '#6366f1', 0),
  ])
  const [activeLayerId, setActiveLayerId] = useState<string>(() => layers[0]?.id ?? '')
  const [syntheticCollapsed, setSyntheticCollapsed] = useState<Record<string, boolean>>({})
  const layersRef = useRef(layers)
  layersRef.current = layers

  const addLayer = useCallback((name: string, colour: string) => {
    const layer = makeSketchLayer(name, colour, 0)
    setLayers(prev => [...prev, { ...layer, order: prev.length }])
    setActiveLayerId(layer.id)
    return layer.id
  }, [])

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      const next = prev.filter(l => l.id !== layerId)
      if (next.length === 0) {
        const fallback = makeSketchLayer('Default Layer', '#94a3b8', 0)
        setActiveLayerId(fallback.id)
        setFeatures(cur => cur.map(f =>
          f.layerId === layerId ? { ...f, layerId: fallback.id } : f
        ))
        return [fallback]
      }
      const fallbackId = next[0].id
      setFeatures(cur => cur.map(f =>
        f.layerId === layerId ? { ...f, layerId: fallbackId } : f
      ))
      setActiveLayerId(cur => cur === layerId ? fallbackId : cur)
      return next
    })
  }, [setFeatures])

  const renameLayer = useCallback((layerId: string, name: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, name } : l))
  }, [])

  const setLayerColour = useCallback((layerId: string, colour: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, colour } : l))
    setFeatures(prev =>
      prev.map(f => {
        if (f.layerId !== layerId) return f
        const updated = { ...f, style: { ...f.style, strokeColor: colour, fillColor: colour } }
        if (viewer) {
          const entity = viewer.entities.getById(f.entityId)
          if (entity) applyStyleToEntity(entity, updated.style)
          const isSolid = f.geometry === 'box' || f.geometry === 'pit' || f.geometry === 'cylinder'
          if (isSolid) {
            for (const sub of viewer.entities.values) {
              if (sub.id.startsWith(f.entityId) && sub.id !== f.entityId) {
                applyStyleToEntity(sub, updated.style)
              }
            }
          }
        }
        return updated
      })
    )
  }, [viewer, setFeatures])

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => {
      const updated = prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l)
      if (viewer) {
        const newVisible = updated.find(l => l.id === layerId)?.visible ?? true
        setFeatures(cur => {
          for (const f of cur) {
            if (f.layerId !== layerId) continue
            const entity = viewer.entities.getById(f.entityId)
            if (entity) entity.show = newVisible
            const isSolid = f.geometry === 'box' || f.geometry === 'pit' || f.geometry === 'cylinder'
            if (isSolid) {
              for (const sub of viewer.entities.values) {
                if (sub.id.startsWith(f.entityId) && sub.id !== f.entityId) {
                  sub.show = newVisible
                }
              }
            }
          }
          return cur
        })
      }
      return updated
    })
  }, [viewer, setFeatures])

  const toggleLayerLock = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, locked: !l.locked } : l))
  }, [])

  const toggleLayerCollapse = useCallback((layerId: string) => {
    if (layersRef.current.some(l => l.id === layerId)) {
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, collapsed: !l.collapsed } : l))
    } else {
      setSyntheticCollapsed(sc => ({ ...sc, [layerId]: !sc[layerId] }))
    }
  }, [])

  return {
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    syntheticCollapsed,
    addLayer,
    removeLayer,
    renameLayer,
    setLayerColour,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerCollapse,
  }
}
