import { useState, useCallback } from 'react'
import { Viewer as CesiumViewerType, Cartesian3 } from 'cesium'
import { X } from 'lucide-react'
import type { NominatimResult } from '../../types/api'

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
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(
              (west + east) / 2,
              (south + north) / 2,
              50000
            ),
          })
        } else {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(Number(lon), Number(lat), 10000),
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
