/**
 * MightyTwin — Design Style Panel
 *
 * Faithful port of the v1 Properties tab symbology section. Composed
 * entirely of reusable row primitives (ColorRow, SliderRow, NumberRow,
 * SelectRow). Style sync between the v2 PointSymbologyPicker and the
 * top-level fields is encapsulated in `useStyleSync`.
 */
import { useMemo } from 'react'
import PointSymbologyPicker from '../../../shared/PointSymbologyPicker'
import { DEFAULT_POINT_SYMBOL } from '../../../shared/pointSymbology'
import type { PointSymbolStyle } from '../../../shared/pointSymbology'
import type { SketchFeature, FeatureStyle } from '../types'
import ColorRow from '../primitives/ColorRow'
import SliderRow from '../primitives/SliderRow'
import SelectRow from '../primitives/SelectRow'
import NumberRow from '../primitives/NumberRow'

const POLYGON_GEOMS = new Set(['polygon', 'rectangle', 'circle', 'box', 'pit', 'cylinder'])
const LINE_GEOMS = new Set(['line', 'traverse'])
const POINT_GEOMS = new Set(['point'])

const LINE_PATTERN_OPTS = [
  { value: 'solid' as const,   label: 'Solid'    },
  { value: 'dash' as const,    label: 'Dash'     },
  { value: 'dot' as const,     label: 'Dot'      },
  { value: 'dashdot' as const, label: 'Dash-dot' },
]
const POINT_SHAPE_OPTS = [
  { value: 'circle' as const,   label: 'Circle'   },
  { value: 'square' as const,   label: 'Square'   },
  { value: 'diamond' as const,  label: 'Diamond'  },
  { value: 'triangle' as const, label: 'Triangle' },
  { value: 'cross' as const,    label: 'Cross'    },
]

interface Props {
  feature: SketchFeature | null
  onStyleChange: (featureId: string, patch: Partial<FeatureStyle>) => void
}

export default function StylePanel({ feature, onStyleChange }: Props) {
  if (!feature) {
    return (
      <div className="design-style-empty">
        <span className="design-style-empty-icon">◇</span>
        No feature selected
      </div>
    )
  }

  const { style } = feature
  const isPoint = POINT_GEOMS.has(feature.geometry)
  const isLine = LINE_GEOMS.has(feature.geometry)
  const isPolygon = POLYGON_GEOMS.has(feature.geometry)
  const showFillStyle = isPolygon
  const showLineStyle = isLine || isPolygon
  const showPointStyle = isPoint
  const showOutline = isPoint || isPolygon

  const labelFieldOptions = useMemo(() => {
    const keys = Object.keys(feature.attributes ?? {}).filter(k =>
      !['lon', 'lat', 'alt'].includes(k))
    return [
      { value: '', label: '— No label —' },
      ...keys.map(k => ({ value: k, label: k })),
    ]
  }, [feature.attributes])

  const change = (patch: Partial<FeatureStyle>) => {
    // PointSymbologyPicker shares strokeColor/fillColor/opacity with the
    // top-level fields. When the user edits a top-level field, propagate to
    // the picker; when they edit the picker, propagate the other way.
    const isPicker = 'pointSymbol' in patch
    const isTopLevel = ('strokeColor' in patch || 'fillColor' in patch || 'opacity' in patch)
    if (isPoint && style.pointSymbol && isTopLevel && !isPicker) {
      const merged = { ...style, ...patch }
      patch.pointSymbol = {
        ...style.pointSymbol,
        strokeColor: merged.strokeColor,
        fillColor: merged.fillColor,
        opacity: merged.opacity,
      }
    }
    if (isPoint && isPicker && !isTopLevel && patch.pointSymbol) {
      patch.strokeColor = patch.pointSymbol.strokeColor
      patch.fillColor = patch.pointSymbol.fillColor
      patch.opacity = patch.pointSymbol.opacity
    }
    onStyleChange(feature.id, patch)
  }

  const pointSymbol: PointSymbolStyle = style.pointSymbol ?? {
    ...DEFAULT_POINT_SYMBOL,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
    opacity: style.opacity,
  }

  return (
    <div className="design-style">
      {isPoint && (
        <PointSymbologyPicker
          value={pointSymbol}
          onChange={(ps) => change({ pointSymbol: ps })}
        />
      )}

      <ColorRow label="Stroke color" value={style.strokeColor} onChange={hex => change({ strokeColor: hex })} />

      {showFillStyle && (
        <>
          <ColorRow label="Fill color" value={style.fillColor} onChange={hex => change({ fillColor: hex })} />
          <SliderRow
            label="Fill opacity"
            value={Math.round((style.fillOpacity ?? style.opacity) * 100)}
            min={0}
            max={100}
            format={v => `${v}%`}
            onChange={v => change({ fillOpacity: v / 100 })}
          />
        </>
      )}

      <SliderRow
        label="Opacity"
        value={Math.round(style.opacity * 100)}
        min={0}
        max={100}
        format={v => `${v}%`}
        onChange={v => change({ opacity: v / 100 })}
      />

      {showLineStyle && (
        <>
          <SliderRow
            label="Line width"
            value={style.lineWidth}
            min={1}
            max={10}
            format={v => `${v}px`}
            onChange={v => change({ lineWidth: v })}
          />
          <SelectRow
            label="Line pattern"
            value={style.lineDash ?? 'solid'}
            options={LINE_PATTERN_OPTS}
            onChange={v => change({ lineDash: v })}
          />
        </>
      )}

      {showPointStyle && (
        <>
          <SliderRow
            label="Point size"
            value={style.pointSize ?? 12}
            min={4}
            max={32}
            format={v => `${v}px`}
            onChange={v => change({ pointSize: v })}
          />
          <SelectRow
            label="Point shape"
            value={style.pointShape ?? 'circle'}
            options={POINT_SHAPE_OPTS}
            onChange={v => change({ pointShape: v })}
          />
        </>
      )}

      {showOutline && (
        <>
          <ColorRow
            label="Outline color"
            value={style.outlineColor ?? style.strokeColor}
            onChange={hex => change({ outlineColor: hex })}
          />
          <NumberRow
            label="Outline width"
            value={style.outlineWidth ?? 2}
            min={0}
            max={10}
            onChange={v => change({ outlineWidth: typeof v === 'number' ? v : 0 })}
          />
        </>
      )}

      <SelectRow
        label="Label field"
        value={style.labelField ?? ''}
        options={labelFieldOptions}
        onChange={v => change({ labelField: v || null })}
      />

      {style.labelField && (
        <NumberRow
          label="Label size"
          value={style.labelSize ?? 12}
          min={8}
          max={24}
          onChange={v => change({ labelSize: typeof v === 'number' ? v : 12 })}
        />
      )}
    </div>
  )
}
