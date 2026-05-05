import { useState, useCallback } from 'react'
import { Viewer as CesiumViewerType } from 'cesium'
import { X } from 'lucide-react'
import type { NominatimResult } from '../../types/api'
import { flyToTarget } from '../../utils/flyToTarget'

interface SearchWidgetProps {
  viewerRef: React.RefObject<CesiumViewerType | null>
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
}

export default function SearchWidget({ viewerRef, searchOpen, setSearchOpen }: SearchWidgetProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || !viewerRef.current) return
    const viewer = viewerRef.current

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const results: NominatimResult[] = await res.json()
      if (results.length > 0) {
        const { lon, lat, boundingbox } = results[0]
        if (boundingbox) {
          const [south, north, west, east] = boundingbox.map(Number)
          // Pick a range that frames the bbox: ~half its diagonal in
          // metres. Falls back to 10 km if the math degenerates.
          const widthMetres =
            Math.cos(((south + north) / 2) * (Math.PI / 180)) *
            (east - west) *
            111_320
          const heightMetres = (north - south) * 111_320
          const diag = Math.hypot(widthMetres, heightMetres)
          flyToTarget(viewer, {
            longitude: (west + east) / 2,
            latitude: (south + north) / 2,
            range: diag > 100 ? diag * 1.4 : 10_000,
          })
        } else {
          flyToTarget(viewer, {
            longitude: Number(lon),
            latitude: Number(lat),
            range: 4500,
          })
        }
      }
    } catch {}
    setSearchOpen(false)
    setSearchQuery('')
  }, [searchQuery, viewerRef, setSearchOpen])

  if (!searchOpen) return null

  return (
    <form className="cesium-search" onSubmit={handleSearch}>
      <input
        autoFocus
        type="text"
        className="cesium-search-input"
        placeholder="Search location…"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      <button type="button" className="map-control-btn" onClick={() => { setSearchOpen(false); setSearchQuery('') }}>
        <X size={16} />
      </button>
    </form>
  )
}
