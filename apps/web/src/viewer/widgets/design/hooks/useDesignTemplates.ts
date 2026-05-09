/** Per-site attribute-template registry hook.
 *
 *  Wires the AttributesEditor to `/api/sites/{slug}/design-templates`
 *  (see `apps/api/src/twin_api/design_template_routes.py`). Lazy-fetches
 *  on mount, exposes a `saveAsTemplate(template)` mutation.
 *
 *  Falls back to an empty list (and silently no-ops on save) when
 *  unauthenticated or when no siteSlug is supplied — matches v1's
 *  permissive behaviour. */
import { useCallback, useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

export interface AttributeTemplateField {
  key: string
  type?: 'text' | 'number' | 'date' | 'select'
  defaultVal?: string
  role?: string
}

export interface AttributeTemplate {
  id: string
  name: string
  geometry?: 'point' | 'line' | 'polygon'
  colour?: string
  fields: AttributeTemplateField[]
  values?: Record<string, unknown>
}

export interface UseDesignTemplatesArgs {
  siteSlug: string | null
  /** When set, the hook returns only templates whose geometry filter is
   *  null OR matches this value. Mirrors v1 picker behaviour. */
  geometryFilter?: 'point' | 'line' | 'polygon' | null
}

export function useDesignTemplates({ siteSlug, geometryFilter }: UseDesignTemplatesArgs) {
  const [all, setAll] = useState<AttributeTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!siteSlug) { setAll([]); return }
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('accessToken')
      const r = await fetch(`${API_URL}/api/sites/${siteSlug}/design-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!r.ok) throw new Error(`${r.status}`)
      const data = await r.json()
      const templates = Array.isArray(data?.templates) ? data.templates : []
      setAll(templates as AttributeTemplate[])
    } catch (e) {
      setError((e as Error).message)
      setAll([])
    } finally {
      setLoading(false)
    }
  }, [siteSlug])

  useEffect(() => { reload() }, [reload])

  const templates = useMemo(() => {
    if (!geometryFilter) return all
    return all.filter(t => !t.geometry || t.geometry === geometryFilter)
  }, [all, geometryFilter])

  const saveAsTemplate = useCallback(async (
    body: Omit<AttributeTemplate, 'id'> & { id?: string },
  ): Promise<AttributeTemplate | null> => {
    if (!siteSlug) return null
    const token = localStorage.getItem('accessToken')
    const r = await fetch(`${API_URL}/api/sites/${siteSlug}/design-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const detail = await r.json().catch(() => ({})) as { detail?: string }
      throw new Error(detail.detail || `Save failed (${r.status})`)
    }
    const data = await r.json() as { template: AttributeTemplate }
    setAll(prev => {
      const next = prev.filter(t => t.id !== data.template.id)
      next.push(data.template)
      return next
    })
    return data.template
  }, [siteSlug])

  const deleteTemplate = useCallback(async (templateId: string) => {
    if (!siteSlug) return
    const token = localStorage.getItem('accessToken')
    const r = await fetch(`${API_URL}/api/sites/${siteSlug}/design-templates/${templateId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (r.ok || r.status === 204) {
      setAll(prev => prev.filter(t => t.id !== templateId))
    }
  }, [siteSlug])

  return {
    templates,
    allTemplates: all,
    loading,
    error,
    reload,
    saveAsTemplate,
    deleteTemplate,
  }
}
