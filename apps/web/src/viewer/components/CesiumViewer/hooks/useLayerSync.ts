import { useRef, useEffect, useMemo } from 'react'
import {
  Viewer as CesiumViewerType,
  GeoJsonDataSource,
  Cesium3DTileset,
  Cesium3DTileStyle,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  GroundPolylinePrimitive,
  GroundPolylineGeometry,
  GeometryInstance,
  PolylineMaterialAppearance,
  Material,
  ColorGeometryInstanceAttribute,
  JulianDate,
  BillboardGraphics,
  VerticalOrigin,
  HeightReference,
  ConstantProperty,
  Cartesian3,
  Color,
  Entity,
} from 'cesium'
import type { Layer } from '../types'
import type { ViewerContext, LayerHandle } from '../../../extensions/types'
import type { SiteConfigState } from '../../../types/api'
import { findLayerRenderer } from '../../../extensions'
import { getSymbologyColor } from '../utils/symbology'
import { pointSymbolToDataUrl, DEFAULT_POINT_SYMBOL } from '../../../shared/pointSymbology'
import type { PointSymbolStyle, PointSymbolType } from '../../../shared/pointSymbology'

export function useLayerSync(
  viewerRef: React.RefObject<CesiumViewerType | null>,
  layers: Layer[],
  siteId: string | undefined,
  siteConfigState: SiteConfigState,
  setSiteConfigState: React.Dispatch<React.SetStateAction<SiteConfigState>>,
) {
  const dsMapRef = useRef<Map<string, GeoJsonDataSource>>(new Map())
  const tilesMapRef = useRef<Map<string, Cesium3DTileset>>(new Map())
  const imgMapRef = useRef<Map<string, ImageryLayer>>(new Map())
  const extHandleMapRef = useRef<Map<string, LayerHandle>>(new Map())
  /** Anchor entities for Gaussian-splat layers. Until full GS rendering
   *  lands the splat appears as a labelled marker at its world anchor so
   *  it shows up in the legend, can be picked, and gives the camera a
   *  fly-to target. */
  const splatMapRef = useRef<Map<string, Entity>>(new Map())

  // Keep latest config in refs so the effect doesn't re-run on config changes
  const siteConfigRef = useRef(siteConfigState)
  siteConfigRef.current = siteConfigState
  const setSiteConfigRef = useRef(setSiteConfigState)
  setSiteConfigRef.current = setSiteConfigState

  // Memoize expensive derived data to avoid recomputing in the effect
  const activeIds = useMemo(
    () => new Set(layers.filter(l => l.visible && l.url).map(l => l.id)),
    [layers],
  )
  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [layers],
  )

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    // Remove layers no longer active
    extHandleMapRef.current.forEach((handle, id) => {
      if (!activeIds.has(id)) { handle.destroy(); extHandleMapRef.current.delete(id) }
    })
    dsMapRef.current.forEach((ds, id) => {
      if (!activeIds.has(id)) { viewer.dataSources.remove(ds, true); dsMapRef.current.delete(id) }
    })
    tilesMapRef.current.forEach((ts, id) => {
      if (!activeIds.has(id)) { viewer.scene.primitives.remove(ts); tilesMapRef.current.delete(id) }
    })
    imgMapRef.current.forEach((il, id) => {
      if (!activeIds.has(id)) { viewer.imageryLayers.remove(il, true); imgMapRef.current.delete(id) }
    })
    splatMapRef.current.forEach((entity, id) => {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity)
        splatMapRef.current.delete(id)
      }
    })

    // Build viewer context for extensions (uses refs to avoid stale closures without adding deps)
    const ctx: ViewerContext = {
      siteId: siteId ?? '',
      getSiteConfig: (key) => siteConfigRef.current[key],
      setSiteConfig: (key, val) => setSiteConfigRef.current(prev => ({ ...prev, [key]: val })),
    }

    // Add/update active layers
    sortedLayers.forEach(layer => {
      if (!layer.visible || !layer.url) return

      // Check if an extension claims this layer
      const ext = findLayerRenderer(layer)
      if (ext?.renderLayer) {
        if (!extHandleMapRef.current.has(layer.id)) {
          const handle = ext.renderLayer(layer, viewer, ctx)
          extHandleMapRef.current.set(layer.id, handle)
        }
        return
      }

      // Core renderers
      if (layer.type === 'vector') {
        if (!dsMapRef.current.has(layer.id)) {
          const { stroke, fill, width } = getSymbologyColor(layer)
          GeoJsonDataSource.load(layer.url, {
            stroke,
            fill,
            strokeWidth: width,
            clampToGround: true,
          }).then(ds => {
            if (!viewerRef.current) return
            ds.name = layer.id

            // Build point symbol style from layer config
            const layerSingle = layer.style?.single
            const ptSymbol: PointSymbolStyle = {
              symbolType: (layerSingle?.pointShape as PointSymbolType) || DEFAULT_POINT_SYMBOL.symbolType,
              size: layerSingle?.pointSize ?? DEFAULT_POINT_SYMBOL.size,
              fillColor: layerSingle?.fillColor ?? layerSingle?.strokeColor ?? layer.style?.color as string ?? DEFAULT_POINT_SYMBOL.fillColor,
              strokeColor: DEFAULT_POINT_SYMBOL.strokeColor,
              opacity: layerSingle?.opacity ?? layer.opacity ?? DEFAULT_POINT_SYMBOL.opacity,
            }
            const ptImgUrl = pointSymbolToDataUrl(ptSymbol)
            const ptIsPin = ['pin', 'pin-outline', 'pin-dot', 'pushpin', 'flag', 'marker', 'beacon'].includes(ptSymbol.symbolType)

            // Upgrade polyline entities to GroundPolylinePrimitive for terrain-clamped rendering
            // and replace point entities with billboard symbology
            ds.entities.values.forEach(entity => {
              if (entity.point) {
                entity.point = undefined as never
                entity.billboard = new BillboardGraphics({
                  image: new ConstantProperty(ptImgUrl),
                  verticalOrigin: new ConstantProperty(ptIsPin ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER),
                  heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
                  disableDepthTestDistance: new ConstantProperty(Number.POSITIVE_INFINITY),
                })
              }
              if (entity.polyline) {
                const positions = entity.polyline.positions?.getValue(JulianDate.now())
                if (positions && positions.length >= 2) {
                  try {
                    const primitive = new GroundPolylinePrimitive({
                      geometryInstances: new GeometryInstance({
                        geometry: new GroundPolylineGeometry({
                          positions,
                          width: Math.max(width, 4),
                        }),
                        attributes: {
                          color: ColorGeometryInstanceAttribute.fromColor(stroke),
                        },
                      }),
                      appearance: new PolylineMaterialAppearance({
                        material: Material.fromType('Color', { color: stroke }),
                      }),
                      asynchronous: false,
                    })
                    viewerRef.current?.scene.groundPrimitives.add(primitive)
                  } catch (_) { /* fallback to default entity */ }
                }
                entity.show = false
              }
            })

            viewerRef.current.dataSources.add(ds)
            dsMapRef.current.set(layer.id, ds)
          }).catch(console.error)
        }
      }

      if (layer.type === '3d-tiles') {
        const existing = tilesMapRef.current.get(layer.id)
        if (!existing) {
          Cesium3DTileset.fromUrl(layer.url).then(ts => {
            if (!viewerRef.current) return
            viewer.scene.primitives.add(ts)
            tilesMapRef.current.set(layer.id, ts)
            applyTilesetOpacity(ts, layer.opacity ?? 1)
            // Auto-frame the tileset on first load — gives Atlas users
            // immediate visual feedback that the layer landed where
            // they expected.
            try {
              viewer.flyTo(ts, { duration: 1.4 })
            } catch {
              /* tileset bounding sphere not ready */
            }
          }).catch(console.error)
        } else {
          existing.show = true
          applyTilesetOpacity(existing, layer.opacity ?? 1)
        }
      }

      if (layer.type === 'wms') {
        if (!imgMapRef.current.has(layer.id)) {
          const provider = new WebMapServiceImageryProvider({
            url: layer.url,
            layers: layer.style?.wmsLayers || '',
            parameters: { transparent: true, format: 'image/png' },
          })
          const il = viewer.imageryLayers.addImageryProvider(provider)
          il.alpha = layer.opacity ?? 1
          imgMapRef.current.set(layer.id, il)
        } else {
          const il = imgMapRef.current.get(layer.id)
          if (il) il.alpha = layer.opacity ?? 1
        }
      }

      if (layer.type === 'wmts') {
        if (!imgMapRef.current.has(layer.id)) {
          const provider = new WebMapTileServiceImageryProvider({
            url: layer.url,
            layer: layer.style?.wmtsLayer || '',
            style: layer.style?.wmtsStyle || 'default',
            tileMatrixSetID: layer.style?.tileMatrixSet || 'EPSG:3857',
            format: 'image/png',
          })
          const il = viewer.imageryLayers.addImageryProvider(provider)
          il.alpha = layer.opacity ?? 1
          imgMapRef.current.set(layer.id, il)
        } else {
          const il = imgMapRef.current.get(layer.id)
          if (il) il.alpha = layer.opacity ?? 1
        }
      }

      if (layer.type === 'splat') {
        // Gaussian splat layers — placeholder volumetric representation
        // pending the full GS renderer (which mounts a sibling canvas
        // and copies Cesium's view + projection matrices each frame —
        // landing in a separate change). For now we draw a wireframe
        // box at layer.style.anchor sized by layer.style.bbox, plus a
        // labelled pin at the centre, so the splat:
        //   - appears in the legend / can be flown to
        //   - shows the user where the scan actually sits in space
        //   - exposes a click-to-open external viewer affordance via
        //     the popup (see useFeatureClick) which reads the
        //     ``splatUrl`` + ``splatFormat`` properties below.
        const anchor = layer.style?.anchor as
          | { lon: number; lat: number; height?: number }
          | undefined
        if (!anchor) return // no anchor → no marker; user must set one in Atlas
        const bbox = (layer.style?.bbox as
          | { width?: number; depth?: number; height?: number }
          | undefined) ?? {}
        // Sensible defaults for a "house-sized" scan when admin hasn't
        // set the bbox yet — 12m × 12m × 6m. Width/depth are along
        // east/north; height is up.
        const W = bbox.width ?? 12
        const D = bbox.depth ?? 12
        const H = bbox.height ?? 6
        const splatColor = Color.fromCssColorString('#ec4899')
        if (!splatMapRef.current.has(layer.id)) {
          // Box centre — anchor.height is the ground; we lift the box
          // by H/2 so the bottom rests on the ground.
          const center = Cartesian3.fromDegrees(
            anchor.lon,
            anchor.lat,
            (anchor.height ?? 0) + H / 2,
          )
          const entity = viewer.entities.add({
            id: `splat-${layer.id}`,
            position: center,
            // Wireframe box — Cesium fills with translucent material +
            // outline. We lean on a faint translucent fill so the user
            // sees the volume without it occluding the scene.
            box: {
              dimensions: new Cartesian3(W, D, H) as unknown as Cartesian3,
              material: splatColor.withAlpha(0.06),
              outline: true,
              outlineColor: splatColor.withAlpha(0.85),
              outlineWidth: 2,
              fill: true,
            },
            label: {
              text: `${layer.name}\n${
                W.toFixed(0)
              }×${
                D.toFixed(0)
              }×${H.toFixed(0)}m splat`,
              font: '11px sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: 2, // FILL_AND_OUTLINE
              verticalOrigin: VerticalOrigin.BOTTOM,
              pixelOffset: new Cartesian3(0, -8, 0) as unknown as Cartesian3,
            },
            properties: {
              splatUrl: layer.url,
              splatFormat:
                (layer.layer_metadata as Record<string, unknown> | undefined)
                  ?.splat_format ?? null,
              splatOrigin:
                (layer.layer_metadata as Record<string, unknown> | undefined)
                  ?.origin_hint ?? null,
              splatBbox: { width: W, depth: D, height: H },
              splatAnchor: anchor,
              isSplatPlaceholder: true,
            },
          })
          splatMapRef.current.set(layer.id, entity)
        } else {
          // Live update — admin tweaked anchor / bbox in Atlas. Refresh
          // the box dimensions + position without recreating the entity
          // so the camera doesn't jump.
          const entity = splatMapRef.current.get(layer.id)
          if (entity) {
            // Cesium accepts a Cartesian3 (auto-wrapped to a
            // ConstantPositionProperty) for entity.position; using the
            // Cartesian directly keeps TS happy without the cast dance.
            entity.position = Cartesian3.fromDegrees(
              anchor.lon,
              anchor.lat,
              (anchor.height ?? 0) + H / 2,
            ) as unknown as Entity['position']
            if (entity.box) {
              entity.box.dimensions = new ConstantProperty(
                new Cartesian3(W, D, H),
              )
            }
          }
        }
      }
    })
  }, [sortedLayers, activeIds, siteId, viewerRef])

  return { imgMapRef, dsMapRef, tilesMapRef, extHandleMapRef }
}

/** Apply a 0..1 opacity to a Cesium3DTileset by setting its style.
 *  This isn't a true alpha — it's a colour multiplier on the tileset's
 *  RGBA — but it's the only knob Cesium gives us short of switching
 *  to a custom material per tile.
 *
 *  When opacity >= 0.999 we clear the style entirely so the tileset
 *  renders with its native materials. */
function applyTilesetOpacity(ts: Cesium3DTileset, opacity: number) {
  try {
    if (opacity >= 0.999) {
      ts.style = undefined as never
      return
    }
    const a = Math.max(0, Math.min(1, opacity)).toFixed(3)
    ts.style = new Cesium3DTileStyle({
      color: `color('white', ${a})`,
    })
  } catch {
    /* tileset disposed */
  }
}
