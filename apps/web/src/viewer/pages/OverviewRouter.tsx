/**
 * MightyTwin — Overview Router
 * Fetches system settings and routes to the correct overview:
 *  - "pins" → SitesMapPage (all-sites globe)
 *  - "preload_site" → redirect to /site/:slug
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../utils/authFetch'
import SitesMapPage from './SitesMapPage'

const API_URL = import.meta.env.VITE_API_URL || ''

interface SystemSettings {
  overview_mode: string
  preload_site_slug: string | null
  overview_camera_lon: number
  overview_camera_lat: number
  overview_camera_height: number
}

export default function OverviewRouter() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'loading' | 'pins' | 'preload'>('loading')

  useEffect(() => {
    authFetch(`${API_URL}/api/settings`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load settings')
        return r.json()
      })
      .then((settings: SystemSettings) => {
        if (settings.overview_mode === 'preload_site' && settings.preload_site_slug) {
          navigate(`/viewer/site/${settings.preload_site_slug}`, { replace: true })
        } else {
          setMode('pins')
        }
      })
      .catch(() => {
        // Fallback to pins mode on error
        setMode('pins')
      })
  }, [navigate])

  if (mode === 'loading') {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f14',
        color: 'white',
      }}>
        Loading...
      </div>
    )
  }

  return <SitesMapPage />
}
