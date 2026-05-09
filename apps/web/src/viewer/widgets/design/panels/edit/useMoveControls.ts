/** Move-mode controls — Coordinate / Bearing & Distance / ΔE/ΔN with their
 *  draft values + apply handlers. Extracted from EditPanel so the panel
 *  itself stays thin. */
import { useState, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { SketchFeature } from '../../types'
import { geodesicOffset, enuDelta, getAnchor } from '../editHelpers'

export type MoveMode = 'coord' | 'bearing' | 'delta'

export interface UseMoveControlsArgs {
  feature: SketchFeature | null
  viewer: CesiumViewerType
  onMoveFeature: (id: string, lon: number, lat: number, alt: number) => void
}

export function useMoveControls({ feature, viewer, onMoveFeature }: UseMoveControlsArgs) {
  const [mode, setMode] = useState<MoveMode>('coord')

  // Coordinate mode
  const [cLon, setCLon] = useState('')
  const [cLat, setCLat] = useState('')
  const [cAlt, setCAlt] = useState('')

  // Bearing + Distance mode
  const [bBearing, setBBearing] = useState('')
  const [bDist, setBDist] = useState('')
  const [bAltDelta, setBAltDelta] = useState('0')

  // Delta mode
  const [dE, setDE] = useState('')
  const [dN, setDN] = useState('')
  const [dAlt, setDAlt] = useState('0')

  const [anchor, setAnchor] = useState<[number, number, number] | null>(null)

  useEffect(() => {
    if (!feature) { setAnchor(null); return }
    const a = getAnchor(feature, viewer)
    setAnchor(a)
    if (a) {
      setCLon(a[0].toFixed(6))
      setCLat(a[1].toFixed(6))
      setCAlt(a[2].toFixed(2))
    }
  }, [feature?.id, viewer])

  function syncFromAnchor(lon: number, lat: number, alt: number) {
    setAnchor([lon, lat, alt])
    setCLon(lon.toFixed(6))
    setCLat(lat.toFixed(6))
    setCAlt(alt.toFixed(2))
  }

  function applyCoord() {
    if (!feature) return
    const lon = parseFloat(cLon)
    const lat = parseFloat(cLat)
    const alt = parseFloat(cAlt)
    if (isNaN(lon) || isNaN(lat) || isNaN(alt)) return
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return
    onMoveFeature(feature.id, lon, lat, alt)
    setAnchor([lon, lat, alt])
  }

  function applyBearing() {
    if (!feature || !anchor) return
    const bearing = parseFloat(bBearing)
    const dist = parseFloat(bDist)
    const altD = parseFloat(bAltDelta) || 0
    if (isNaN(bearing) || isNaN(dist)) return
    const [lon, lat, alt] = geodesicOffset(anchor[0], anchor[1], anchor[2], bearing, dist, altD)
    onMoveFeature(feature.id, lon, lat, alt)
    syncFromAnchor(lon, lat, alt)
  }

  function applyDelta() {
    if (!feature || !anchor) return
    const e = parseFloat(dE) || 0
    const n = parseFloat(dN) || 0
    const a = parseFloat(dAlt) || 0
    const [lon, lat, alt] = enuDelta(anchor[0], anchor[1], anchor[2], e, n, a)
    onMoveFeature(feature.id, lon, lat, alt)
    syncFromAnchor(lon, lat, alt)
  }

  return {
    mode, setMode,
    coord: { lon: cLon, lat: cLat, alt: cAlt, setLon: setCLon, setLat: setCLat, setAlt: setCAlt, apply: applyCoord },
    bearing: { bearing: bBearing, dist: bDist, altDelta: bAltDelta, setBearing: setBBearing, setDist: setBDist, setAltDelta: setBAltDelta, apply: applyBearing },
    delta: { e: dE, n: dN, alt: dAlt, setE: setDE, setN: setDN, setAlt: setDAlt, apply: applyDelta },
    anchor,
  }
}
