import { describe, expect, it } from 'vitest'
import { Cartesian3 } from 'cesium'
import {
  computePolylineDistance,
  computePolygonArea,
  formatArea,
  formatDistance,
} from '../src/measureUtils'

describe('formatDistance', () => {
  it('shows metres with one decimal under 1 km', () => {
    expect(formatDistance(0)).toBe('0.0 m')
    expect(formatDistance(12.3)).toBe('12.3 m')
    expect(formatDistance(999.4)).toBe('999.4 m')
  })

  it('switches to km with two decimals at 1 km and above', () => {
    expect(formatDistance(1000)).toBe('1.00 km')
    expect(formatDistance(12_345)).toBe('12.35 km')
  })
})

describe('formatArea', () => {
  it('uses square metres under 1 hectare', () => {
    expect(formatArea(0)).toBe('0 m²')
    expect(formatArea(5432)).toBe('5432 m²')
    expect(formatArea(9999)).toBe('9999 m²')
  })

  it('uses hectares from 1 ha to 1 km²', () => {
    expect(formatArea(10_000)).toBe('1.00 ha')
    expect(formatArea(123_456)).toBe('12.35 ha')
    expect(formatArea(999_999)).toBe('100.00 ha')
  })

  it('uses km² from 1 km² upwards', () => {
    expect(formatArea(1_000_000)).toBe('1.00 km²')
    expect(formatArea(12_345_678)).toBe('12.35 km²')
  })
})

describe('computePolylineDistance', () => {
  it('returns 0 for empty or single-point arrays', () => {
    expect(computePolylineDistance([])).toBe(0)
    expect(computePolylineDistance([Cartesian3.fromDegrees(0, 0)])).toBe(0)
  })

  it('computes total Cartesian distance across segments', () => {
    const a = Cartesian3.fromDegrees(115.78, -32.0)
    const b = Cartesian3.fromDegrees(115.79, -32.0)
    const c = Cartesian3.fromDegrees(115.79, -32.01)
    const d = computePolylineDistance([a, b, c])
    // Rough: ~950 m + ~1110 m → > 2000 m, < 2500 m
    expect(d).toBeGreaterThan(2000)
    expect(d).toBeLessThan(2500)
  })
})

describe('computePolygonArea', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(computePolygonArea([])).toBe(0)
    expect(computePolygonArea([Cartesian3.fromDegrees(0, 0)])).toBe(0)
    expect(
      computePolygonArea([
        Cartesian3.fromDegrees(0, 0),
        Cartesian3.fromDegrees(0.01, 0),
      ]),
    ).toBe(0)
  })

  it('computes a positive area for a triangle', () => {
    const area = computePolygonArea([
      Cartesian3.fromDegrees(115.78, -32.0),
      Cartesian3.fromDegrees(115.79, -32.0),
      Cartesian3.fromDegrees(115.785, -32.01),
    ])
    // Triangle of order 10^5 m² — allow an order-of-magnitude envelope
    expect(area).toBeGreaterThan(1_000)
    expect(area).toBeLessThan(10_000_000)
  })

  it('returns a non-negative value regardless of winding order', () => {
    const points = [
      Cartesian3.fromDegrees(0, 0),
      Cartesian3.fromDegrees(1, 0),
      Cartesian3.fromDegrees(1, 1),
      Cartesian3.fromDegrees(0, 1),
    ]
    const ccw = computePolygonArea(points)
    const cw = computePolygonArea([...points].reverse())
    expect(ccw).toBeGreaterThan(0)
    expect(cw).toBeGreaterThan(0)
    expect(ccw).toBeCloseTo(cw, 0)
  })
})
