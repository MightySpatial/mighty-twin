import { useCallback, useEffect, useState } from 'react'
import { CHANGE_EVENT, DEFAULT_SETTINGS, STORAGE_KEY, type AppSettings } from '../types'

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

function readFromStorage(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as DeepPartial<AppSettings>
    return mergeDeep(DEFAULT_SETTINGS, parsed)
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeToStorage(settings: AppSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }))
  } catch (err) {
    console.warn('[settings] localStorage write failed', err)
  }
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) return base
  if (typeof base !== 'object' || base === null) return (patch as unknown as T) ?? base
  const out = { ...(base as Record<string, unknown>) } as Record<string, unknown>
  for (const k of Object.keys(patch)) {
    const p = (patch as Record<string, unknown>)[k]
    const b = (base as Record<string, unknown>)[k]
    if (p !== undefined) {
      out[k] = typeof b === 'object' && b !== null && !Array.isArray(b) && typeof p === 'object' && p !== null
        ? mergeDeep(b as unknown as object, p as DeepPartial<object>)
        : p
    }
  }
  return out as T
}

/**
 * Read and update persisted app settings. Subscribes to the
 * `mighty-settings-change` CustomEvent so any component updates when another
 * component writes.
 */
export function usePersistedSettings(): {
  settings: AppSettings
  update: (patch: DeepPartial<AppSettings>) => void
  reset: () => void
} {
  const [settings, setSettings] = useState<AppSettings>(readFromStorage)

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<AppSettings>).detail
      if (detail) setSettings(detail)
    }
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])

  const update = useCallback((patch: DeepPartial<AppSettings>) => {
    setSettings((current) => {
      const next = mergeDeep(current, patch)
      writeToStorage(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    writeToStorage(DEFAULT_SETTINGS)
    setSettings(DEFAULT_SETTINGS)
  }, [])

  return { settings, update, reset }
}
