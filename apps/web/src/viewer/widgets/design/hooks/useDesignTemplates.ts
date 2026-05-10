/**
 * useDesignTemplates — fetches the per-site attribute-template registry.
 *
 * Wraps `/api/sites/{slug}/design-templates` (GET to list, POST to add).
 * Templates carry `{ id, name, geometry?, colour?, fields[], values? }`
 * and are stamped onto a freshly committed draft node by the
 * AttributesEditor's "save as template" + chip picker flows.
 *
 * The hook caches results per site for the session — list re-fetches
 * are cheap but the chip strip mounts/unmounts often as the user
 * switches tools, so we hold the array in module scope keyed by slug
 * and dedupe in-flight fetches. Spec V1_SPEC.md §8.
 */
import { useCallback, useEffect, useState } from 'react'
import type { SchemaField } from '../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

export interface DesignTemplate {
  id: string
  name: string
  /** Optional geometry filter — chips are filtered to the active tool's
   *  geometry kind. Templates without a geometry tag show for everyone. */
  geometry?: 'point' | 'line' | 'polygon'
  colour?: string
  fields: SchemaField[]
  values?: Record<string, unknown>
}

interface CacheEntry {
  templates: DesignTemplate[]
  loadedAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<DesignTemplate[]>>()

function authHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  const token = localStorage.getItem('accessToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchTemplates(siteSlug: string): Promise<DesignTemplate[]> {
  const r = await fetch(`${API_URL}/api/sites/${encodeURIComponent(siteSlug)}/design-templates`, {
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(`design-templates GET ${siteSlug} → ${r.status}`)
  const data = await r.json() as { templates?: DesignTemplate[] }
  return data.templates ?? []
}

export interface UseDesignTemplatesResult {
  templates: DesignTemplate[]
  loading: boolean
  error: string | null
  /** Append a template — used by the AttributesEditor's save-as button.
   *  Returns the persisted template (server may rewrite the id). */
  saveTemplate: (t: Omit<DesignTemplate, 'id'> & { id?: string }) => Promise<DesignTemplate | null>
  /** Force a refetch — useful after explicit creates from elsewhere. */
  refresh: () => void
}

export function useDesignTemplates(siteSlug: string | null): UseDesignTemplatesResult {
  const [templates, setTemplates] = useState<DesignTemplate[]>(() =>
    siteSlug ? cache.get(siteSlug)?.templates ?? [] : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!siteSlug) return
    let pending = inflight.get(siteSlug)
    if (!pending) {
      setLoading(true)
      pending = fetchTemplates(siteSlug)
      inflight.set(siteSlug, pending)
    }
    pending
      .then(list => {
        cache.set(siteSlug, { templates: list, loadedAt: Date.now() })
        setTemplates(list)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false)
        inflight.delete(siteSlug)
      })
  }, [siteSlug])

  useEffect(() => {
    if (!siteSlug) {
      setTemplates([])
      return
    }
    const cached = cache.get(siteSlug)
    if (cached) setTemplates(cached.templates)
    load()
  }, [siteSlug, load])

  const saveTemplate = useCallback(
    async (t: Omit<DesignTemplate, 'id'> & { id?: string }): Promise<DesignTemplate | null> => {
      if (!siteSlug) return null
      try {
        const r = await fetch(`${API_URL}/api/sites/${encodeURIComponent(siteSlug)}/design-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(t),
        })
        if (!r.ok) throw new Error(`design-templates POST → ${r.status}`)
        const data = await r.json() as { template: DesignTemplate }
        const next = [...(cache.get(siteSlug)?.templates ?? []).filter(x => x.id !== data.template.id), data.template]
        cache.set(siteSlug, { templates: next, loadedAt: Date.now() })
        setTemplates(next)
        return data.template
      } catch (e) {
        setError((e as Error).message)
        return null
      }
    },
    [siteSlug],
  )

  return { templates, loading, error, saveTemplate, refresh: load }
}

/** Geometry-kind filter helper — accepts the tool's geometryType. */
export function filterTemplatesByGeometry(
  templates: DesignTemplate[],
  geometry: 'point' | 'line' | 'polygon' | 'other' | null,
): DesignTemplate[] {
  if (!geometry || geometry === 'other') return templates
  return templates.filter(t => !t.geometry || t.geometry === geometry)
}
