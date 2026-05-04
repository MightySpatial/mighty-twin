import type { AISettings } from './types'

const KEY = 'mighty-twin.ai-settings'

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage unavailable / corrupt — fall through to defaults
  }
  return { active: 'anthropic', byProvider: {} }
}

export function saveSettings(s: AISettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
