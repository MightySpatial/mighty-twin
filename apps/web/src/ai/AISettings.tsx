/** AI provider settings — embedded as a section in Twin's settings shell.
 *  Mirrors mighty-sheets/AISettingsModal.tsx (grouped Hosted/Local picker
 *  + active-provider key/model/baseUrl form), but renders inside the
 *  shared @mightyspatial/settings-panels surface instead of as a modal.
 *
 *  BYOK only — keys live in localStorage; nothing routes through Mighty.
 */

import { useState } from 'react'
import { loadSettings, saveSettings } from './storage'
import { AGENT_PRESETS, type AIProvider, type AISettings as AISettingsT } from './types'

/** Where each provider's dashboard exposes API keys. Used to render a
 *  "Get key" deep link next to the input so mobile users don't have to
 *  hunt — and so paste-from-clipboard becomes the dominant path. */
const KEY_URLS: Partial<Record<AIProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  groq: 'https://console.groq.com/keys',
  together: 'https://api.together.xyz/settings/api-keys',
  fireworks: 'https://fireworks.ai/account/api-keys',
  perplexity: 'https://www.perplexity.ai/settings/api',
  mistral: 'https://console.mistral.ai/api-keys/',
  deepseek: 'https://platform.deepseek.com/api_keys',
  xai: 'https://console.x.ai/',
}

/** Strip whitespace, stray quotes, and trailing newlines that mobile
 *  pasteboards routinely add when copying from a dashboard. */
function sanitizeKey(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '')
}

export default function AISettings() {
  const [s, setS] = useState<AISettingsT>(() => loadSettings())
  const [showKey, setShowKey] = useState(false)

  const update = (patch: Partial<AISettingsT>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveSettings(next)
  }

  const updProvider = (
    p: AIProvider,
    patch: Partial<{ apiKey: string; baseUrl: string; model: string }>,
  ) => {
    const next = {
      ...s,
      byProvider: { ...s.byProvider, [p]: { ...s.byProvider[p], ...patch } },
    }
    setS(next)
    saveSettings(next)
  }

  const groups: Record<string, typeof AGENT_PRESETS> = {
    'Hosted (BYOK)': AGENT_PRESETS.filter((a) => a.flavor === 'byok'),
    'Local': AGENT_PRESETS.filter((a) => a.flavor === 'local'),
  }

  const activeCfg = s.byProvider[s.active] ?? {}
  const isLocal = s.active === 'ollama' || s.active === 'lmstudio'
  const keyUrl = KEY_URLS[s.active]

  const aiPanelVisible = s.aiPanelVisible !== false

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>AI</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 0 }}>
        Bring your own key. Nothing routes through Mighty servers — your messages
        go directly to the provider you pick. Keys stay in your browser's
        localStorage.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          marginTop: 12,
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          fontSize: 13,
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        <input
          type="checkbox"
          checked={aiPanelVisible}
          onChange={(e) => update({ aiPanelVisible: e.target.checked })}
        />
        <span>Show Mighty AI panel</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Right-rail in Map and Atlas. Reload to apply.
        </span>
      </label>

      {/* Phone widths get a single column; ~520px+ goes side-by-side. The
       *  hardcoded "1fr 1fr" we used to ship squished both columns on
       *  phones and made the key field unusable. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        <div>
          {Object.entries(groups).map(([label, presets]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: 6,
                }}
              >
                {label}
              </div>
              {presets.map((preset) => {
                const isActive =
                  s.active === preset.provider &&
                  (s.byProvider[preset.provider]?.model ?? preset.defaultModel) === preset.defaultModel
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      update({ active: preset.provider })
                      updProvider(preset.provider, {
                        model: preset.defaultModel,
                        baseUrl: preset.defaultBaseUrl,
                      })
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      marginBottom: 4,
                      borderRadius: 6,
                      background: isActive ? 'rgba(99,102,241,0.16)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: 'rgba(255,255,255,0.85)',
                      cursor: 'pointer',
                      font: 'inherit',
                      minHeight: 44,
                    }}
                  >
                    <input
                      type="radio"
                      checked={isActive}
                      readOnly
                      style={{ marginRight: 8 }}
                    />
                    <span style={{ fontWeight: 500 }}>{preset.label}</span>
                    {preset.hint && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 22 }}>
                        {preset.hint}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: 13, marginTop: 0, color: 'rgba(255,255,255,0.85)' }}>
            Active provider · {s.active}
          </h3>
          <Field
            label="API key"
            adornment={
              keyUrl && !isLocal ? (
                <a
                  href={keyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{
                    fontSize: 11,
                    color: 'rgba(129,140,248,0.95)',
                    textDecoration: 'none',
                  }}
                >
                  Get key ↗
                </a>
              ) : null
            }
          >
            <div style={{ position: 'relative' }}>
              <input
                type={showKey || isLocal ? 'text' : 'password'}
                value={activeCfg.apiKey ?? ''}
                onChange={(e) =>
                  updProvider(s.active, { apiKey: sanitizeKey(e.target.value) })
                }
                onPaste={(e) => {
                  // Sanitize on paste so the displayed value matches what we
                  // store; otherwise the iOS pasteboard's trailing newline
                  // gets saved and silently breaks Authorization headers.
                  const pasted = e.clipboardData.getData('text')
                  const cleaned = sanitizeKey(pasted)
                  if (cleaned !== pasted) {
                    e.preventDefault()
                    updProvider(s.active, { apiKey: cleaned })
                  }
                }}
                placeholder={isLocal ? 'no key required' : 'paste key here'}
                disabled={isLocal}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                aria-label="API key"
                style={{ ...inputStyle, paddingRight: isLocal ? 10 : 60 }}
              />
              {!isLocal && (
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  aria-pressed={showKey}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 36,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.65)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          </Field>
          <Field label="Model">
            <input
              value={activeCfg.model ?? ''}
              onChange={(e) => updProvider(s.active, { model: e.target.value })}
              placeholder="e.g. claude-sonnet-4-6"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={inputStyle}
            />
          </Field>
          <Field label="Base URL (override)">
            <input
              value={activeCfg.baseUrl ?? ''}
              onChange={(e) => updProvider(s.active, { baseUrl: e.target.value })}
              placeholder="default"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="url"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  adornment,
  children,
}: {
  label: string
  adornment?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'rgba(255,255,255,0.6)',
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        {adornment}
      </div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  font: 'inherit',
  fontSize: 14,
  minHeight: 44,
  boxSizing: 'border-box',
}
