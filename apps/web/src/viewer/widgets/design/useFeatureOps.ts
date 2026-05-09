/**
 * MightyTwin — Feature CRUD Operations
 * Manages sketch features: add, remove, rename, move, restyle, select.
 * Extracted from useDesignState for maintainability.
 */
import { useState, useCallback, useMemo, type MutableRefObject } from 'react'
import {
  Viewer as CesiumViewerType,
  Cartesian3,
  Color,
  JulianDate,
  PolygonHierarchy,
  ConstantProperty,
  ConstantPositionProperty,
} from 'cesium'
import type {
  SketchFeature,
  SketchLayer,
  FeatureStyle,
  BoxDraft,
  PitDraft,
  CylDraft,
} from './types'
import { applyStyleToEntity } from './tools/designStyleUtils'
import { commitBox, commitCylinder, commitPit } from './tools/solidCommit'

interface UseFeatureOpsArgs {
  viewer: CesiumViewerType | null
  layersRef: MutableRefObject<SketchLayer[]>
  layers: SketchLayer[]
  syntheticCollapsed: Record<string, boolean>
}

export function useFeatureOps({ viewer, layersRef, layers, syntheticCollapsed }: UseFeatureOpsArgs) {
  const [features, setFeatures] = useState<SketchFeature[]>([])
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)

  const addFeature = useCallback((feature: SketchFeature) => {
    const targetLayer = layersRef.current.find(l => l.id === feature.layerId)
    if (targetLayer?.locked) return
    setFeatures(prev => [...prev, feature])
  }, [layersRef])

  const removeFeature = useCallback((featureId: string) => {
    setFeatures(prev => {
      const feat = prev.find(f => f.id === featureId)
      if (feat && viewer) {
        const isSolid = feat.geometry === 'box' || feat.geometry === 'pit' || feat.geometry === 'cylinder'
        if (isSolid) {
          const toRemove: string[] = []
          for (const ent of viewer.entities.values) {
            if (ent.id === feat.entityId || ent.id.startsWith(feat.entityId + '_') || ent.id.startsWith(feat.entityId + '__')) {
              toRemove.push(ent.id)
            }
          }
          for (const id of toRemove) {
            const ent = viewer.entities.getById(id)
            if (ent) viewer.entities.remove(ent)
          }
        } else {
          const entity = viewer.entities.getById(feat.entityId)
          if (entity) viewer.entities.remove(entity)
        }
      }
      return prev.filter(f => f.id !== featureId)
    })
    setSelectedFeatureId(prev => {
      if (prev === featureId) {
        if (viewer) viewer.selectedEntity = undefined
        return null
      }
      return prev
    })
  }, [viewer])

  const renameFeature = useCallback((featureId: string, label: string) => {
    setFeatures(prev => prev.map(f => f.id === featureId ? { ...f, label } : f))
  }, [])

  const moveFeature = useCallback((featureId: string, newLon: number, newLat: number, newAlt: number) => {
    if (!viewer) return
    setFeatures(prev => prev.map(f => {
      if (f.id !== featureId) return f
      const isSolid = f.geometry === 'box' || f.geometry === 'pit' || f.geometry === 'cylinder'

      if (isSolid) {
        const toRemove: string[] = []
        for (const ent of viewer.entities.values) {
          if (ent.id === f.entityId || ent.id.startsWith(f.entityId + '_') || ent.id.startsWith(f.entityId + '__')) {
            toRemove.push(ent.id)
          }
        }
        for (const id of toRemove) {
          const ent = viewer.entities.getById(id)
          if (ent) viewer.entities.remove(ent)
        }
        const draft = { ...(f.attributes as Record<string, unknown>), lon: newLon, lat: newLat, alt: newAlt }
        const fillCol = Color.fromCssColorString(f.style.fillColor).withAlpha(f.style.opacity * 0.65)
        const outlineCol = Color.fromCssColorString(f.style.strokeColor).withAlpha(f.style.opacity)
        if (f.geometry === 'box') commitBox(viewer, draft as BoxDraft, f.entityId, fillCol, outlineCol)
        else if (f.geometry === 'cylinder') commitCylinder(viewer, draft as CylDraft, f.entityId, fillCol, outlineCol)
        else if (f.geometry === 'pit') commitPit(viewer, draft as PitDraft, f.entityId, fillCol, outlineCol)
        return { ...f, attributes: draft }
      }

      const now = JulianDate.now()
      const ent = viewer.entities.getById(f.entityId)
      if (!ent) return { ...f, attributes: { ...(f.attributes as object), lon: newLon, lat: newLat, alt: newAlt } }

      let oldAnchor: Cartesian3 | null = null
      if (ent.position) {
        oldAnchor = ent.position.getValue(now) ?? null
      } else if (ent.polyline?.positions) {
        const arr: Cartesian3[] = ent.polyline.positions.getValue(now) ?? []
        if (arr.length) {
          const sum = arr.reduce((acc, p) => Cartesian3.add(acc, p, new Cartesian3()), new Cartesian3())
          oldAnchor = new Cartesian3(sum.x / arr.length, sum.y / arr.length, sum.z / arr.length)
        }
      } else if (ent.polygon?.hierarchy) {
        const h = ent.polygon.hierarchy.getValue(now) as PolygonHierarchy | undefined
        if (h?.positions?.length) {
          const sum = h.positions.reduce((acc, p) => Cartesian3.add(acc, p, new Cartesian3()), new Cartesian3())
          oldAnchor = new Cartesian3(sum.x / h.positions.length, sum.y / h.positions.length, sum.z / h.positions.length)
        }
      }

      const newWorld = Cartesian3.fromDegrees(newLon, newLat, newAlt)
      if (!oldAnchor) return { ...f, attributes: { ...(f.attributes as object), lon: newLon, lat: newLat, alt: newAlt } }
      const delta = Cartesian3.subtract(newWorld, oldAnchor, new Cartesian3())

      if (ent.position) {
        const cur = ent.position.getValue(now)
        if (cur) ent.position = new ConstantPositionProperty(Cartesian3.add(cur, delta, new Cartesian3()))
      }
      if (ent.polyline?.positions) {
        const arr: Cartesian3[] = ent.polyline.positions.getValue(now) ?? [];
        (ent.polyline as unknown as Record<string, unknown>).positions = new ConstantProperty(arr.map(p => Cartesian3.add(p, delta, new Cartesian3())))
      }
      if (ent.polygon?.hierarchy) {
        const h = ent.polygon.hierarchy.getValue(now) as PolygonHierarchy | undefined
        if (h?.positions) {
          (ent.polygon as unknown as Record<string, unknown>).hierarchy = new ConstantProperty(new PolygonHierarchy(h.positions.map(p => Cartesian3.add(p, delta, new Cartesian3()))))
        }
      }
      return { ...f, attributes: { ...(f.attributes as object), lon: newLon, lat: newLat, alt: newAlt } }
    }))
  }, [viewer])

  const updateFeatureStyle = useCallback((featureId: string, patch: Partial<FeatureStyle>) => {
    setFeatures(prev => prev.map(f => {
      if (f.id !== featureId) return f
      const updated = { ...f, style: { ...f.style, ...patch } }
      if (viewer) {
        const entity = viewer.entities.getById(f.entityId)
        if (entity) applyStyleToEntity(entity, updated.style)
        const isSolid = f.geometry === 'box' || f.geometry === 'pit' || f.geometry === 'cylinder'
        if (isSolid) {
          const prefix = f.entityId
          const all = viewer.entities.values
          for (let i = 0; i < all.length; i++) {
            const sub = all[i]
            if (sub.id.startsWith(prefix) && sub.id !== prefix) {
              applyStyleToEntity(sub, updated.style)
            }
          }
        }
      }
      return updated
    }))
  }, [viewer])

  const selectFeature = useCallback((featureId: string | null) => {
    setSelectedFeatureId(featureId)
    if (!viewer) return
    if (!featureId) {
      viewer.selectedEntity = undefined
      return
    }
    setFeatures(current => {
      const feat = current.find(f => f.id === featureId)
      if (feat) {
        const entity = viewer.entities.getById(feat.entityId)
        if (entity) viewer.selectedEntity = entity
      }
      return current
    })
  }, [viewer])

  const selectedFeature = useMemo(
    () => features.find(f => f.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  )

  const featuresByLayer = useMemo(() => {
    const grouped: Array<{ layer: SketchLayer; features: SketchFeature[] }> = []
    for (const layer of layers) {
      const layerFeatures = features.filter(f => f.layerId === layer.id)
      if (layerFeatures.length > 0) {
        grouped.push({ layer, features: layerFeatures })
      }
    }
    const knownLayerIds = new Set(layers.map(l => l.id))
    const orphans = features.filter(f => !knownLayerIds.has(f.layerId))
    if (orphans.length > 0) {
      grouped.push({
        layer: {
          id: '__orphan', name: 'Ungrouped', colour: '#94a3b8',
          visible: true, locked: false, order: 999,
          collapsed: !!syntheticCollapsed['__orphan'],
          coordMode: 'world', fields: [],
        },
        features: orphans,
      })
    }
    return grouped
  }, [layers, features, syntheticCollapsed])

  return {
    features,
    setFeatures,
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeature,
    featuresByLayer,
    addFeature,
    removeFeature,
    renameFeature,
    moveFeature,
    updateFeatureStyle,
    selectFeature,
  }
}
