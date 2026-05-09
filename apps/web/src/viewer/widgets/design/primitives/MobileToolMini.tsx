/** Phone mini-controller — shown in place of the full design widget when a
 *  tool is active on a small screen. Cancel + Done buttons + datum/offset
 *  inputs only. Mirrors v1's behaviour: collapse the widget so the user has
 *  the map for picks, surface only the elevation knobs that affect placement. */
import type { ElevationConfig, ElevationDatum } from '../types'
import SelectRow from './SelectRow'
import NumberRow from './NumberRow'

const TOOL_ICON: Record<string, string> = {
  point: '📍', line: '📏', polygon: '⬡', rectangle: '▭',
  circle: '○', traverse: '↗', box: '⬛', pit: '⬇', cylinder: '⬤', select: '↖',
}

interface Props {
  tool: string
  elevationConfig: ElevationConfig
  onElevationChange: (cfg: ElevationConfig) => void
  onCancel: () => void
  onDone: () => void
}

export default function MobileToolMini({ tool, elevationConfig, onElevationChange, onCancel, onDone }: Props) {
  return (
    <div className="dw-mobile-mini">
      <div className="dw-mobile-mini__hd">
        <span className="dw-mobile-mini__icon">{TOOL_ICON[tool] ?? '✏️'}</span>
        <span className="dw-mobile-mini__name">{tool}</span>
        <div className="dw-mobile-mini__spacer" />
        <button className="dw-mobile-mini__btn dw-mobile-mini__btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="dw-mobile-mini__btn dw-mobile-mini__btn--primary" onClick={onDone}>Done</button>
      </div>
      <div className="dw-mobile-mini__body">
        <SelectRow<ElevationDatum>
          label="Datum"
          value={elevationConfig.datum}
          onChange={datum => onElevationChange({ ...elevationConfig, datum })}
          options={[
            { value: 'terrain', label: 'Terrain' },
            { value: 'ellipsoid', label: 'Ellipsoid' },
            { value: 'mga2020', label: 'MGA2020' },
            { value: 'custom_terrain', label: 'Custom terrain' },
          ]}
        />
        <NumberRow
          label="Offset"
          value={elevationConfig.offset}
          step={0.001}
          unit="m"
          onChange={v => onElevationChange({ ...elevationConfig, offset: typeof v === 'number' ? v : 0 })}
        />
      </div>
    </div>
  )
}
