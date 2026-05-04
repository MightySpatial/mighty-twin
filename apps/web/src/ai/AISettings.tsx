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

export default function AISettings() {
  const [s, setS] = useState<AISettingsT>(() => loadSettings())

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

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>AI</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 0 }}>
        Bring your own key. Nothing routes through Mighty servers — your messages
        go directly to the provider you pick. Keys stay in your browser's
        localStorage.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
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
                      padding: '8px 10px',
                      marginBottom: 4,
                      borderRadius: 6,
                      background: isActive ? 'rgba(99,102,241,0.16)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: 'rgba(255,255,255,0.85)',
                      cursor: 'pointer',
                      font: 'inherit',
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
          <Field label="API key">
            <input
              type="password"
              value={activeCfg.apiKey ?? ''}
              onChange={(e) => updProvider(s.active, { apiKey: e.target.value })}
              placeholder={
                s.active === 'ollama' || s.active === 'lmstudio'
                  ? 'no key required'
                  : 'paste key here'
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Model">
            <input
              value={activeCfg.model ?? ''}
              onChange={(e) => updProvider(s.active, { model: e.target.value })}
              placeholder="e.g. claude-sonnet-4-6"
              style={inputStyle}
            />
          </Field>
          <Field label="Base URL (override)">
            <input
              value={activeCfg.baseUrl ?? ''}
              onChange={(e) => updProvider(s.active, { baseUrl: e.target.value })}
              placeholder="default"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  font: 'inherit',
  fontSize: 13,
}
