/** AI providers settings — provider card grid + 3-step wizard +
 *  per-feature overrides + approval policy.
 *
 *  Replaces the prior radio-list panel. Behaviourally:
 *    • Each provider shows as a card. Connected (apiKey set, or keyless
 *      local provider) gets the green border + ✓ badge.
 *    • "Add key" / "Configure" / "Manage" opens a 3-step wizard:
 *        step 1 — paste API key (or baseUrl for local/custom)
 *        step 2 — pick default model from preset tiles (or custom)
 *        step 3 — fire a real "Hello." ping via testConnection, show
 *                 latency + sample reply; Save commits to localStorage
 *    • Per-feature overrides + approval policy live below the grid and
 *      autosave on change.
 *
 *  Ported from the design mockup in apps/web/public/dev/ai-providers/.
 */

import { useEffect, useMemo, useState } from 'react'
import { loadSettings, saveSettings } from './storage'
import { testConnection, type TestConnectionResult } from './client'
import {
  PROVIDER_DISPLAY,
  PROVIDER_ORDER,
  AI_FEATURES,
  AI_APPROVAL_SCOPES,
  DEFAULT_APPROVAL_POLICY,
  type AIProvider,
  type AISettings as AISettingsT,
  type AIFeature,
  type AIApprovalScope,
  type AIApprovalMode,
  type ProviderDisplay,
} from './types'
import './AISettings.css'

// ── Helpers ─────────────────────────────────────────────────────────────

function isConnected(p: AIProvider, s: AISettingsT): boolean {
  const cfg = s.byProvider[p]
  if (PROVIDER_DISPLAY[p].keyless) {
    // Local + custom slots are "connected" once the user has touched
    // them — we mark them on Save in the wizard by stamping any field.
    return !!(cfg?.baseUrl ?? cfg?.model)
  }
  return !!(cfg?.apiKey && cfg.apiKey.trim())
}

function connectedProviders(s: AISettingsT): AIProvider[] {
  return PROVIDER_ORDER.flatMap(g => g.ids).filter(id => isConnected(id, s))
}

const APPROVAL_LABELS: Record<AIApprovalMode, string> = {
  auto: 'Auto-approve',
  ask: 'Always ask',
  disabled: 'Disabled',
}

// ── Root component ──────────────────────────────────────────────────────

export default function AISettings() {
  const [s, setS] = useState<AISettingsT>(() => loadSettings())
  const [wizardFor, setWizardFor] = useState<AIProvider | null>(null)

  // Persist on every change. Cheap (just localStorage), so no debounce.
  const update = (next: AISettingsT) => {
    setS(next)
    saveSettings(next)
  }

  const setPanelVisible = (v: boolean) => update({ ...s, aiPanelVisible: v })
  const setActive = (p: AIProvider) => update({ ...s, active: p })
  const setOverride = (f: AIFeature, patch: Partial<{ provider: AIProvider; model: string }>) => {
    const current = s.featureOverrides?.[f] ?? { provider: s.active, model: s.byProvider[s.active]?.model ?? '' }
    update({
      ...s,
      featureOverrides: { ...s.featureOverrides, [f]: { ...current, ...patch } },
    })
  }
  const setPolicy = (scope: AIApprovalScope, mode: AIApprovalMode) => {
    update({ ...s, approvalPolicy: { ...s.approvalPolicy, [scope]: mode } })
  }

  const onWizardSave = (provider: AIProvider, cfg: { apiKey?: string; baseUrl?: string; model: string }) => {
    const next: AISettingsT = {
      ...s,
      active: provider,
      byProvider: { ...s.byProvider, [provider]: { ...s.byProvider[provider], ...cfg } },
    }
    update(next)
    setWizardFor(null)
  }
  const onDisconnect = (provider: AIProvider) => {
    if (!confirm(`Disconnect ${PROVIDER_DISPLAY[provider].name}? Your stored key for this provider will be cleared.`)) return
    const { [provider]: _, ...rest } = s.byProvider
    let nextActive = s.active
    if (nextActive === provider) {
      // Fall back to the first remaining connected provider, or Anthropic.
      nextActive = (connectedProviders(s).find(p => p !== provider) ?? 'anthropic') as AIProvider
    }
    update({ ...s, active: nextActive, byProvider: rest })
  }

  const connected = useMemo(() => connectedProviders(s), [s])

  return (
    <div className="aiset">
      <h1>AI providers</h1>
      <p className="aiset-lede">
        Mighty doesn't mark up inference. Bring your own key — your messages go
        directly to the provider you connect. Keys stay in your browser's local
        storage and are never sent to Mighty servers. Per-feature overrides let
        you balance cost and quality across Mai, voxel design, and story maps.
      </p>

      <label className="aiset-toggle-row">
        <input
          type="checkbox"
          checked={s.aiPanelVisible !== false}
          onChange={e => setPanelVisible(e.target.checked)}
        />
        <span>Show Mighty AI right-rail panel</span>
        <span className="aiset-toggle-aside">Reload to apply.</span>
      </label>

      {/* ── Provider card grid ───────────────────────────────────── */}
      <section className="aiset-section">
        <h2>Connected providers</h2>
        {PROVIDER_ORDER.map(group => (
          <div key={group.group} className="aiset-group">
            <div className="aiset-group-label">
              {group.group === 'hosted' ? 'Hosted (BYOK)' : 'Local & custom'}
            </div>
            <div className="aiset-grid">
              {group.ids.map(id => (
                <ProviderCard
                  key={id}
                  display={PROVIDER_DISPLAY[id]}
                  connected={isConnected(id, s)}
                  isActive={s.active === id}
                  onConfigure={() => setWizardFor(id)}
                  onSetActive={() => setActive(id)}
                  onDisconnect={() => onDisconnect(id)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Per-feature overrides ─────────────────────────────────── */}
      <section className="aiset-section">
        <h2>Per-feature model overrides</h2>
        <div className="aiset-table">
          {AI_FEATURES.map(f => {
            const ov = s.featureOverrides?.[f.id]
            const provider = ov?.provider ?? s.active
            const model = ov?.model ?? (s.byProvider[provider]?.model ?? PROVIDER_DISPLAY[provider].models[0]?.id ?? '')
            const providerOptions = connected.length > 0 ? connected : [s.active]
            const modelOptions = PROVIDER_DISPLAY[provider].models
            return (
              <div key={f.id} className="aiset-row">
                <div>
                  <div className="aiset-feat-name">{f.label}</div>
                  <div className="aiset-feat-desc">{f.description}</div>
                </div>
                <select
                  className="aiset-select"
                  value={model}
                  onChange={e => setOverride(f.id, { model: e.target.value })}
                >
                  {modelOptions.map(m => (
                    <option key={m.id || '__custom'} value={m.id}>
                      {m.label || '(use loaded model)'}
                    </option>
                  ))}
                  {!modelOptions.some(m => m.id === model) && model && (
                    <option value={model}>{model}</option>
                  )}
                </select>
                <select
                  className="aiset-select"
                  value={provider}
                  onChange={e => setOverride(f.id, { provider: e.target.value as AIProvider })}
                >
                  {providerOptions.map(p => (
                    <option key={p} value={p}>
                      {PROVIDER_DISPLAY[p].name}{isConnected(p, s) ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Approval policy ──────────────────────────────────────── */}
      <section className="aiset-section">
        <h2>Approval policy</h2>
        <div className="aiset-table">
          {AI_APPROVAL_SCOPES.map(scope => {
            const current = (s.approvalPolicy?.[scope.id] ?? DEFAULT_APPROVAL_POLICY[scope.id]) as AIApprovalMode
            return (
              <div key={scope.id} className="aiset-row policy-row">
                <div>
                  <div className="aiset-feat-name">{scope.label}</div>
                  <div className="aiset-feat-desc">{scope.description}</div>
                </div>
                <select
                  className="aiset-select"
                  value={current}
                  onChange={e => setPolicy(scope.id, e.target.value as AIApprovalMode)}
                >
                  {scope.modes.map(m => (
                    <option key={m} value={m}>{APPROVAL_LABELS[m]}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </section>

      {wizardFor && (
        <Wizard
          provider={wizardFor}
          initialCfg={s.byProvider[wizardFor] ?? {}}
          onCancel={() => setWizardFor(null)}
          onSave={(cfg) => onWizardSave(wizardFor, cfg)}
        />
      )}
    </div>
  )
}

// ── Provider card ───────────────────────────────────────────────────────

function ProviderCard({
  display, connected, isActive, onConfigure, onSetActive, onDisconnect,
}: {
  display: ProviderDisplay
  connected: boolean
  isActive: boolean
  onConfigure: () => void
  onSetActive: () => void
  onDisconnect: () => void
}) {
  return (
    <div className={`aiset-card${connected ? ' is-connected' : ''}${isActive ? ' is-active' : ''}`}>
      {connected && <span className="aiset-connected-badge">✓ Connected</span>}
      <div className={`aiset-logo ${display.logoClass}`}>{display.glyph}</div>
      <div className="aiset-name">{display.name}</div>
      <div className="aiset-desc">{display.description}</div>
      <div className="aiset-meta">
        {display.metaPills.map(p => <span key={p} className="aiset-pill">{p}</span>)}
      </div>
      <div className="aiset-card-actions">
        {connected ? (
          <>
            <button className="aiset-btn manage" onClick={onConfigure}>Manage</button>
            {!isActive && (
              <button className="aiset-btn aiset-set-active" onClick={onSetActive}>Set active</button>
            )}
            {!display.keyless && (
              <button className="aiset-btn danger aiset-set-active" onClick={onDisconnect}>Disconnect</button>
            )}
          </>
        ) : (
          <button className="aiset-btn primary" onClick={onConfigure}>
            {display.keyless ? 'Configure' : 'Add key'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Wizard modal ────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3

function Wizard({
  provider, initialCfg, onCancel, onSave,
}: {
  provider: AIProvider
  initialCfg: { apiKey?: string; baseUrl?: string; model?: string }
  onCancel: () => void
  onSave: (cfg: { apiKey?: string; baseUrl?: string; model: string }) => void
}) {
  const display = PROVIDER_DISPLAY[provider]
  const [step, setStep] = useState<WizardStep>(1)
  const [apiKey, setApiKey] = useState(initialCfg.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(initialCfg.baseUrl ?? '')
  const [model, setModel] = useState(initialCfg.model || display.models[0]?.id || '')
  const [customModel, setCustomModel] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestConnectionResult | null>(null)

  // Step 1 → 2 gate: hosted providers need an apiKey, local/custom need a baseUrl.
  const step1Ok = display.keyless ? baseUrl.trim().length > 0 : apiKey.trim().length > 0
  // Step 2 → 3 gate: a model id must be set (custom-mode requires text).
  const effectiveModel = customModel || model
  const step2Ok = effectiveModel.trim().length > 0 || display.keyless // LM Studio + custom can save with empty model

  // Run the test when the user lands on step 3.
  useEffect(() => {
    if (step !== 3) return
    setTesting(true)
    setResult(null)
    const cfg = {
      apiKey: display.keyless ? undefined : apiKey,
      baseUrl: display.keyless ? baseUrl : (baseUrl || undefined),
      model: effectiveModel || undefined,
    }
    testConnection(provider, cfg).then(r => {
      setResult(r)
      setTesting(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function save() {
    onSave({
      apiKey: display.keyless ? undefined : apiKey,
      baseUrl: baseUrl || undefined,
      model: effectiveModel,
    })
  }

  // ESC closes the wizard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="aiset-wizard-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="aiset-wizard" role="dialog" aria-label={`${display.name} setup`}>
        <div className="aiset-wizard-header">
          <div className={`aiset-wizard-logo ${display.logoClass}`}>{display.glyph}</div>
          <div>
            <div className="aiset-wizard-title">{display.name}</div>
            <div className="aiset-wizard-sub">
              Step {step} of 3 · {step === 1
                ? (display.keyless ? 'Base URL'
                  : provider === 'openai-codex' ? 'CLI session'
                  : 'API key')
                : step === 2 ? 'Default model'
                : 'Verify connection'}
            </div>
          </div>
        </div>

        <div className="aiset-wizard-steps">
          {[1, 2, 3].map(n => (
            <span
              key={n}
              className={`aiset-step-dot${n === step ? ' is-active' : ''}${n < step ? ' is-done' : ''}`}
            />
          ))}
        </div>

        {step === 1 && (
          <Step1
            display={display}
            apiKey={apiKey} setApiKey={setApiKey}
            baseUrl={baseUrl} setBaseUrl={setBaseUrl}
          />
        )}
        {step === 2 && (
          <Step2
            display={display}
            model={model} setModel={setModel}
            customModel={customModel} setCustomModel={setCustomModel}
          />
        )}
        {step === 3 && (
          <Step3
            display={display}
            effectiveModel={effectiveModel}
            testing={testing}
            result={result}
            onRetry={() => setStep(3)}
          />
        )}

        <div className="aiset-wizard-actions">
          {step === 1 && (
            <>
              <button className="aiset-btn" onClick={onCancel}>Cancel</button>
              <button className="aiset-btn primary" disabled={!step1Ok} onClick={() => setStep(2)}>Next →</button>
            </>
          )}
          {step === 2 && (
            <>
              <button className="aiset-btn" onClick={() => setStep(1)}>← Back</button>
              <button className="aiset-btn primary" disabled={!step2Ok} onClick={() => setStep(3)}>Test connection →</button>
            </>
          )}
          {step === 3 && (
            <>
              <button className="aiset-btn" onClick={() => setStep(2)}>← Back</button>
              <button
                className="aiset-btn primary"
                disabled={testing || !result?.ok}
                onClick={save}
              >Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Wizard steps ────────────────────────────────────────────────────────

function Step1({
  display, apiKey, setApiKey, baseUrl, setBaseUrl,
}: {
  display: ProviderDisplay
  apiKey: string; setApiKey: (v: string) => void
  baseUrl: string; setBaseUrl: (v: string) => void
}) {
  if (display.keyless) {
    return (
      <div className="aiset-field">
        <label className="aiset-field-label">Base URL</label>
        <input
          className="aiset-input"
          type="text"
          autoFocus
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={display.keyPlaceholder}
        />
        <div className="aiset-hint">
          {display.id === 'ollama' && <>Make sure Ollama is running: <code>ollama serve</code>. Default endpoint is <code>http://localhost:11434</code>.</>}
          {display.id === 'lmstudio' && <>Start the local server in LM Studio → Developer → Start Server. Default: <code>http://localhost:1234/v1</code>.</>}
          {display.id === 'openai-compatible' && <>Any OpenAI-compatible <code>/chat/completions</code> endpoint. Paste the base URL (without <code>/chat/completions</code>).</>}
        </div>
      </div>
    )
  }
  const isCodex = display.id === 'openai-codex'
  return (
    <>
      <div className="aiset-field">
        <label className="aiset-field-label">
          {isCodex ? 'Codex CLI session token' : 'API key'}
        </label>
        <input
          className="aiset-input"
          type="password"
          autoFocus
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={display.keyPlaceholder}
        />
        <div className="aiset-hint">
          {isCodex ? (
            <>
              In your terminal: <code>codex login</code> (one-time), then{' '}
              <code>codex auth print</code> to copy the session token. Paste
              it above.<br />
              The token is stored in your browser like any other API key.
              Don't have the Codex CLI yet? Install from{' '}
              {display.keyDocsUrl && (
                <a href={display.keyDocsUrl} target="_blank" rel="noopener noreferrer">{display.keyDocsLabel}</a>
              )}.
            </>
          ) : (
            <>
              {display.keyDocsUrl && (
                <>Get your key at <a href={display.keyDocsUrl} target="_blank" rel="noopener noreferrer">{display.keyDocsLabel}</a>.<br /></>
              )}
              Keys are stored in your browser only — never sent to Mighty servers.
            </>
          )}
        </div>
      </div>
      <div className="aiset-field">
        <label className="aiset-field-label">Base URL (optional override)</label>
        <input
          className="aiset-input"
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="default"
        />
      </div>
    </>
  )
}

function Step2({
  display, model, setModel, customModel, setCustomModel,
}: {
  display: ProviderDisplay
  model: string; setModel: (v: string) => void
  customModel: string; setCustomModel: (v: string) => void
}) {
  const isCustom = customModel.length > 0
  return (
    <div className="aiset-field">
      <label className="aiset-field-label">Choose your default model</label>
      <div className="aiset-model-grid">
        {display.models.map(m => (
          <button
            key={m.id || '__empty'}
            className={`aiset-model-tile${!isCustom && model === m.id ? ' is-selected' : ''}`}
            onClick={() => { setModel(m.id); setCustomModel('') }}
          >
            <div className="aiset-model-name">{m.label || '(use loaded model)'}</div>
            <div className="aiset-model-meta">{m.meta}</div>
          </button>
        ))}
        <button
          className={`aiset-model-tile${isCustom ? ' is-selected' : ''}`}
          onClick={() => { /* Tile click focuses the input; no-op here. */ }}
          type="button"
        >
          <div className="aiset-model-name">Custom model</div>
          <div className="aiset-model-meta">Type any model identifier</div>
        </button>
      </div>
      <input
        className="aiset-input"
        style={{ marginTop: 10 }}
        type="text"
        value={customModel}
        onChange={e => setCustomModel(e.target.value)}
        placeholder="e.g. claude-haiku-4-5 or gpt-4o-mini"
      />
      <div className="aiset-hint">
        The default model is what Mai and the per-feature overrides use unless you set a different one below.
      </div>
    </div>
  )
}

function Step3({
  display, effectiveModel, testing, result, onRetry,
}: {
  display: ProviderDisplay
  effectiveModel: string
  testing: boolean
  result: TestConnectionResult | null
  onRetry: () => void
}) {
  return (
    <>
      <div className="aiset-test">
        <span className={`aiset-test-dot ${testing ? 'pending' : result?.ok ? 'ok' : 'err'}`} />
        <span>
          {testing && <>Sending test prompt to <strong>{effectiveModel || '(default)'}</strong>…</>}
          {!testing && result?.ok && <>✓ Response received in <strong>{result.latencyMs} ms</strong></>}
          {!testing && result && !result.ok && <>Test failed — see error below.</>}
        </span>
      </div>

      {!testing && result?.ok && (
        <div className="aiset-test-success">
          ✓ Connected. Mai will use <strong>{effectiveModel || display.models[0]?.label || display.name}</strong> via{' '}
          <strong>{display.name}</strong> by default. You can override per-feature on the main panel.
          {result.sample && (
            <div style={{ marginTop: 6, opacity: 0.85, fontStyle: 'italic' }}>
              Reply: "{result.sample}"
            </div>
          )}
        </div>
      )}

      {!testing && result && !result.ok && (
        <>
          <div className="aiset-test-error">{result.error}</div>
          <button className="aiset-btn" style={{ alignSelf: 'flex-start' }} onClick={onRetry}>Retry test</button>
        </>
      )}

      <div className="aiset-hint">
        This sends a single short test prompt (&ldquo;Hello.&rdquo;) to verify the
        key and model are valid. No data from your project is sent.
      </div>
    </>
  )
}
