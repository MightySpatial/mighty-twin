import { useEffect, useState } from 'react'
import type { StoryMap } from '../components/StoryMapPlayer'
import { authFetch } from '../utils/authFetch'
import { useToast } from './useToast'

const API_URL = import.meta.env.VITE_API_URL || ''

export function useStoryMaps(siteSlug: string | undefined) {
  const [storyMaps, setStoryMaps] = useState<StoryMap[]>([])
  const { addToast } = useToast()

  useEffect(() => {
    if (!siteSlug) { setStoryMaps([]); return }
    authFetch(`${API_URL}/api/story-maps?site_slug=${encodeURIComponent(siteSlug)}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load story maps')
        return r.json()
      })
      .then(setStoryMaps)
      .catch((err) => {
        setStoryMaps([])
        addToast('error', err instanceof Error ? err.message : 'Failed to load story maps')
      })
  }, [siteSlug, addToast])

  return storyMaps
}
