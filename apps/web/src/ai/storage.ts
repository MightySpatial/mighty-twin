import type { AISettings } from './types'

const KEY = 'mighty-twin.ai-settings'

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.aiPanelVisible === undefined) parsed.aiPanelVisible = true
      return parsed
    }
  } catch {
    // localStorage unavailable / corrupt — fall through to defaults
  }
  return { active: 'anthropic', byProvider: {}, aiPanelVisible: true }
}

export function saveSettings(s: AISettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/** Whether the right-rail Mighty AI panel should mount. Read on App
 *  mount; updated via the AI Settings panel and a `storage` event. */
export function loadAiPanelVisible(): boolean {
  return loadSettings().aiPanelVisible !== false
}
