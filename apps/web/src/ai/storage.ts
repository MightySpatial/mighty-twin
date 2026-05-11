import type { AISettings } from './types'
import { DEFAULT_APPROVAL_POLICY } from './types'

const KEY = 'mighty-twin.ai-settings'

/** Merge stored settings with defaults for fields added since the user
 *  first saved (featureOverrides, approvalPolicy). Older blobs ride
 *  through untouched apart from the new fields filling in. */
function seedDefaults(s: Partial<AISettings>): AISettings {
  return {
    active: s.active ?? 'anthropic',
    byProvider: s.byProvider ?? {},
    aiPanelVisible: s.aiPanelVisible !== false,
    featureOverrides: s.featureOverrides ?? {},
    approvalPolicy: { ...DEFAULT_APPROVAL_POLICY, ...(s.approvalPolicy ?? {}) },
  }
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return seedDefaults(JSON.parse(raw))
  } catch {
    // localStorage unavailable / corrupt — fall through to defaults
  }
  return seedDefaults({})
}

export function saveSettings(s: AISettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/** Whether the right-rail Mighty AI panel should mount. Read on App
 *  mount; updated via the AI Settings panel and a `storage` event. */
export function loadAiPanelVisible(): boolean {
  return loadSettings().aiPanelVisible !== false
}
