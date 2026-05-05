/** Elevation profile chart — T+1170.
 *
 *  SVG chart of distance (x) vs elevation (y) with hover-synced
 *  crosshair. Hover events bubble up to the parent so the on-globe
 *  marker can track the user's pointer.
 */

import { useMemo, useRef, useState } from 'react'
import type { SamplePoint } from './useTerrain'

interface Props {
  samples: SamplePoint[]
  height?: number
  onHoverSample?: (idx: number | null) => void
}

const PADDING = { top: 10, right: 8, bottom: 28, left: 48 }

export default function ProfileChart({ samples, height = 200, onHoverSample }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const dims = useMemo(() => {
    if (samples.length === 0) {
      return null
    }
    const distances = samples.map((s) => s.distance)
    const heights = samples.map((s) => s.height)
    const xMin = 0
    const xMax = Math.max(distances[distances.length - 1], 1)
    let yMin = Math.min(...heights)
    let yMax = Math.max(...heights)
    if (yMax - yMin < 1) {
      // Flat profile — give a small visible range so the line isn't
      // crammed into a single pixel row.
      const m = (yMax + yMin) / 2
      yMin = m - 1
      yMax = m + 1
    } else {
      const pad = (yMax - yMin) * 0.08
      yMin -= pad
      yMax += pad
    }
    return { xMin, xMax, yMin, yMax }
  }, [samples])

  if (!dims || samples.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(240,242,248,0.4)',
          fontSize: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8,
        }}
      >
        No samples yet
      </div>
    )
  }

  const W = 600
  const H = height
  const innerW = W - PADDING.left - PADDING.right
  const innerH = H - PADDING.top - PADDING.bottom
  const xScale = (d: number) =>
    PADDING.left + ((d - dims.xMin) / (dims.xMax - dims.xMin)) * innerW
  const yScale = (h: number) =>
    PADDING.top + (1 - (h - dims.yMin) / (dims.yMax - dims.yMin)) * innerH

  const linePath = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xScale(s.distance).toFixed(2)} ${yScale(s.height).toFixed(2)}`)
    .join(' ')
  const areaPath =
    `M ${xScale(samples[0].distance).toFixed(2)} ${yScale(dims.yMin).toFixed(2)} ` +
    samples
      .map((s) => `L ${xScale(s.distance).toFixed(2)} ${yScale(s.height).toFixed(2)}`)
      .join(' ') +
    ` L ${xScale(samples[samples.length - 1].distance).toFixed(2)} ${yScale(dims.yMin).toFixed(2)} Z`

  // Y axis ticks — pick 4 nice values
  const yTicks = chooseTicks(dims.yMin, dims.yMax, 4)
  const xTicks = chooseTicks(dims.xMin, dims.xMax, 5)

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dims) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    // Convert client x to viewBox x via the rect ratio
    const xPx = ((e.clientX - rect.left) / rect.width) * W
    if (xPx < PADDING.left || xPx > PADDING.left + innerW) {
      if (hover !== null) {
        setHover(null)
        onHoverSample?.(null)
      }
      return
    }
    const distance = dims.xMin + ((xPx - PADDING.left) / innerW) * (dims.xMax - dims.xMin)
    // Find closest sample by binary search
    let lo = 0
    let hi = samples.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (samples[mid].distance < distance) lo = mid + 1
      else hi = mid
    }
    let idx = lo
    if (idx > 0 && Math.abs(samples[idx - 1].distance - distance) < Math.abs(samples[idx].distance - distance)) {
      idx = idx - 1
    }
    if (idx !== hover) {
      setHover(idx)
      onHoverSample?.(idx)
    }
  }

  function onMouseLeave() {
    if (hover !== null) {
      setHover(null)
      onHoverSample?.(null)
    }
  }

  const hovered = hover != null ? samples[hover] : null

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id="terrain-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2453ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2453ff" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + innerW}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={yScale(t) + 3}
              textAnchor="end"
              fontSize="9"
              fontFamily="monospace"
              fill="rgba(240,242,248,0.45)"
            >
              {fmtMetres(t)}
            </text>
          </g>
        ))}

        {/* X axis ticks + labels */}
        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line
              x1={xScale(t)}
              x2={xScale(t)}
              y1={PADDING.top + innerH}
              y2={PADDING.top + innerH + 3}
              stroke="rgba(240,242,248,0.45)"
              strokeWidth={1}
            />
            <text
              x={xScale(t)}
              y={PADDING.top + innerH + 14}
              textAnchor="middle"
              fontSize="9"
              fontFamily="monospace"
              fill="rgba(240,242,248,0.55)"
            >
              {fmtDistance(t)}
            </text>
          </g>
        ))}

        {/* X-axis line */}
        <line
          x1={PADDING.left}
          x2={PADDING.left + innerW}
          y1={PADDING.top + innerH}
          y2={PADDING.top + innerH}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />

        {/* Filled area + line */}
        <path d={areaPath} fill="url(#terrain-fill)" />
        <path d={linePath} fill="none" stroke="#9bb3ff" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Hover crosshair */}
        {hovered && (
          <g pointerEvents="none">
            <line
              x1={xScale(hovered.distance)}
              x2={xScale(hovered.distance)}
              y1={PADDING.top}
              y2={PADDING.top + innerH}
              stroke="#2dd4bf"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle
              cx={xScale(hovered.distance)}
              cy={yScale(hovered.height)}
              r={4}
              fill="#2dd4bf"
              stroke="#0f0f14"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            padding: '4px 8px',
            background: 'rgba(15,15,20,0.92)',
            border: '1px solid rgba(45,212,191,0.32)',
            borderRadius: 6,
            color: '#f0f2f8',
            fontSize: 11,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            display: 'flex',
            gap: 10,
          }}
        >
          <span style={{ color: 'rgba(240,242,248,0.55)' }}>
            d:&nbsp;<strong style={{ color: '#9bb3ff' }}>{fmtDistance(hovered.distance)}</strong>
          </span>
          <span style={{ color: 'rgba(240,242,248,0.55)' }}>
            h:&nbsp;<strong style={{ color: '#2dd4bf' }}>{fmtMetres(hovered.height)}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

function chooseTicks(min: number, max: number, count: number): number[] {
  if (max - min < 1e-6) return [min]
  const step = niceStep((max - min) / count)
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 0.0001; v += step) {
    out.push(Math.round(v * 1e6) / 1e6)
  }
  return out
}

function niceStep(rough: number): number {
  const exp = Math.floor(Math.log10(rough))
  const f = rough / Math.pow(10, exp)
  let nice
  if (f < 1.5) nice = 1
  else if (f < 3) nice = 2
  else if (f < 7) nice = 5
  else nice = 10
  return nice * Math.pow(10, exp)
}

function fmtMetres(m: number): string {
  if (Math.abs(m) >= 1000) return `${(m / 1000).toFixed(2)} km`
  if (Math.abs(m) >= 100) return `${m.toFixed(0)} m`
  if (Math.abs(m) >= 10) return `${m.toFixed(1)} m`
  return `${m.toFixed(2)} m`
}

function fmtDistance(m: number): string {
  if (m >= 10_000) return `${(m / 1000).toFixed(1)} km`
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${m.toFixed(0)} m`
}
