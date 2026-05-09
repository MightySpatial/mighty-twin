/** All Download Panel state + side-effects (file triggering, format
 *  branching, CRS hint propagation). DownloadPanel becomes pure rendering. */
import { useMemo, useState } from 'react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../../types'
import { serializeSketchLayers, type GeoJSONFeature } from '../../serializeFeatures'
import { geojsonToCsv } from './csv'
import { splitFeatures, slugifySplitKey, type SplitMode } from './split'
import { FORMAT_BY_ID, type ExportFormat } from './formats'

export interface UseDownloadArgs {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

export function useDownload({ viewer, layers, features }: UseDownloadArgs) {
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const [crs, setCrs] = useState<number>(4326)
  const [sketchScope, setSketchScope] = useState<string>('__all__')
  const [splitMode, setSplitMode] = useState<SplitMode>('none')
  const [splitAttr, setSplitAttr] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const visibleLayers = layers.filter(l => l.visible)
    const visibleIds = new Set<string>()
    for (const f of features) {
      if (visibleLayers.some(l => l.id === f.layerId)) visibleIds.add(f.id)
    }
    return {
      visibleLayers,
      featureCount: visibleIds.size,
      totalLayers: layers.length,
      totalFeatures: features.length,
    }
  }, [layers, features])

  const formatSpec = FORMAT_BY_ID[format]
  const isBackendBlocked = !formatSpec.clientSide

  function trigger(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function geoJsonForScope(): { features: GeoJSONFeature[]; skipped: number } {
    const inScope = sketchScope === '__all__'
      ? features
      : features.filter(f => f.layerId === sketchScope)
    return serializeSketchLayers(layers, inScope, viewer)
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      if (isBackendBlocked) {
        throw new Error(`${formatSpec.label} export needs the server-side export service (not yet wired up in v2). Use GeoJSON or CSV for now.`)
      }

      if (format === 'json_state') {
        const payload = { schema: 1, exported_at: new Date().toISOString(), layers, features }
        trigger(`mighty-twin-design-state-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json')
        return
      }

      const { features: gjFeatures, skipped } = geoJsonForScope()
      if (gjFeatures.length === 0) {
        throw new Error(skipped > 0
          ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
          : 'No features to download in scope.')
      }

      // Annotate non-WGS84 exports so a downstream tool can reproject.
      if (crs !== 4326) {
        gjFeatures.forEach(f => {
          f.properties = { ...f.properties, _crs_requested: crs }
        })
      }

      const splitGroups = splitFeatures(gjFeatures, splitMode, splitAttr)

      if (format === 'geojson') {
        for (const { key, items } of splitGroups) {
          if (items.length === 0) continue
          const filename = splitGroups.length === 1
            ? `mighty-twin-design-${stamp}.geojson`
            : `${slugifySplitKey(key)}-${stamp}.geojson`
          trigger(
            filename,
            JSON.stringify({ type: 'FeatureCollection', features: items }, null, 2),
            'application/geo+json',
          )
        }
        return
      }

      if (format === 'csv') {
        for (const { key, items } of splitGroups) {
          if (items.length === 0) continue
          const filename = splitGroups.length === 1
            ? `mighty-twin-design-${stamp}.csv`
            : `${slugifySplitKey(key)}-${stamp}.csv`
          trigger(filename, geojsonToCsv(items), 'text/csv')
        }
        return
      }

      throw new Error(`Format "${format}" is not implemented client-side.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return {
    // selection
    format, setFormat,
    crs, setCrs,
    sketchScope, setSketchScope,
    splitMode, setSplitMode,
    splitAttr, setSplitAttr,
    // derived
    summary,
    isBackendBlocked,
    formatSpec,
    // actions
    downloading,
    error,
    download,
  }
}
