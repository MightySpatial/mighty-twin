/** AI fetch wrapper — BYOK, multi-provider. Ported from
 *  mighty-sheets/src/engine/ai.ts. Same pattern: keys read from
 *  localStorage, requests go directly to the provider's endpoint, no
 *  Mighty-managed inference.
 *
 *  Provider matrix:
 *    • Anthropic        — native /v1/messages format + tool-use loop
 *    • Gemini           — native generateContent envelope
 *    • Ollama           — native /api/chat format (different shape)
 *    • Everything else  — OpenAI Chat Completions format, routed
 *                         through `fetchOpenAICompatible`. Provider-
 *                         specific extras (OpenRouter Referer/X-Title)
 *                         are added per branch.
 *
 *  Streaming: not enabled — the Anthropic branch in this file doesn't
 *  stream either, and the chat() consumers (ChatPanel) buffer the full
 *  response before rendering. Worth a follow-up once Anthropic streams.
 */

import { loadSettings } from './storage'
import { activeTools, findTool } from './tools'
import type { AIMessage, AIProvider } from './types'

const DEFAULTS: Record<AIProvider, { model: string; baseUrl?: string }> = {
  anthropic:           { model: 'claude-haiku-4-5-20251001' },
  openai:              { model: 'gpt-4o-mini',  baseUrl: 'https://api.openai.com/v1' },
  gemini:              { model: 'gemini-2.0-flash' },
  openrouter:          { model: 'openrouter/auto', baseUrl: 'https://openrouter.ai/api/v1' },
  groq:                { model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
  together:            { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', baseUrl: 'https://api.together.xyz/v1' },
  fireworks:           { model: 'accounts/fireworks/models/llama-v3p1-405b-instruct', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  perplexity:          { model: 'sonar', baseUrl: 'https://api.perplexity.ai' },
  mistral:             { model: 'mistral-large-latest', baseUrl: 'https://api.mistral.ai/v1' },
  deepseek:            { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  xai:                 { model: 'grok-2-latest', baseUrl: 'https://api.x.ai/v1' },
  ollama:              { model: 'llama3.2', baseUrl: 'http://localhost:11434' },
  lmstudio:            { model: '', baseUrl: 'http://localhost:1234/v1' },
  'openai-compatible': { model: '' },
}

/** Providers that route through the OpenAI Chat Completions helper.
 *  Anthropic + Gemini + Ollama need their own envelope; everything
 *  else can share one fetch shape. */
const OPENAI_COMPAT: ReadonlySet<AIProvider> = new Set<AIProvider>([
  'openai', 'openrouter', 'groq', 'together', 'fireworks',
  'perplexity', 'mistral', 'deepseek', 'xai', 'lmstudio', 'openai-compatible',
])

/** Providers that require an API key in Settings → AI. Local providers
 *  (Ollama, LM Studio) and the custom OpenAI-compatible slot run keyless. */
const REQUIRES_KEY: ReadonlySet<AIProvider> = new Set<AIProvider>([
  'anthropic', 'openai', 'gemini', 'openrouter', 'groq', 'together',
  'fireworks', 'perplexity', 'mistral', 'deepseek', 'xai',
])

export interface ChatOptions {
  maxTokens?: number
  /** Optional abort signal — bound to the React unmount cleanup. */
  signal?: AbortSignal
  /** When true, expose the v1 read-only Twin MCP tool catalog to the
   *  model and execute calls in the browser against /api endpoints.
   *  Defaults to true; set false for plain-text testing.
   *
   *  Note: tool use is wired for Anthropic only. Other providers run
   *  the prompt through Chat Completions without tools — the chat
   *  panel surfaces this in its hint copy. Wiring OpenAI/etc. tool
   *  calling is a follow-up; the shape is similar but each provider
   *  has its own quirks. */
  tools?: boolean
  /** Hard cap on tool-use ↔ assistant rounds within a single chat()
   *  call so a model can't loop forever. Default 4. */
  maxToolRounds?: number
}

export class MissingApiKeyError extends Error {
  constructor(public readonly provider: AIProvider) {
    super(`Set a ${provider} API key in Settings → AI.`)
    this.name = 'MissingApiKeyError'
  }
}

/** Send a chat conversation. Returns the assistant's text. */
export async function chat(
  messages: AIMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const settings = loadSettings()
  const provider = settings.active
  const cfg = settings.byProvider[provider] ?? {}
  const model = cfg.model || DEFAULTS[provider].model
  const maxTokens = opts.maxTokens ?? 1200
  const signal = opts.signal

  if (REQUIRES_KEY.has(provider) && !cfg.apiKey) {
    throw new MissingApiKeyError(provider)
  }

  if (provider === 'anthropic') {
    return chatAnthropic({ cfg, model, maxTokens, messages, signal, opts })
  }
  if (provider === 'gemini') {
    return chatGemini({ cfg, model, maxTokens, messages, signal })
  }
  if (provider === 'ollama') {
    return chatOllama({ cfg, model, maxTokens, messages, signal })
  }
  if (OPENAI_COMPAT.has(provider)) {
    return chatOpenAICompatible({ provider, cfg, model, maxTokens, messages, signal })
  }

  // Exhaustiveness check — if AIProvider gets a new value the type
  // checker forces us back here. Fail loud rather than silently.
  throw new Error(`No fetch branch wired for provider "${provider}".`)
}

// ── Provider branches ──────────────────────────────────────────────────

interface BranchArgs {
  cfg: { apiKey?: string; baseUrl?: string; model?: string }
  model: string
  maxTokens: number
  messages: AIMessage[]
  signal?: AbortSignal
}

async function chatAnthropic(args: BranchArgs & { opts: ChatOptions }): Promise<string> {
  const { cfg, model, maxTokens, messages, signal, opts } = args
  const apiKey = cfg.apiKey!
  const sys = messages.find((m) => m.role === 'system')?.content
  const useTools = opts.tools !== false
  const maxRounds = opts.maxToolRounds ?? 4

  let anthMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> =
    messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  let textOut = ''
  for (let round = 0; round < maxRounds; round++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sys,
        messages: anthMessages,
        ...(useTools
          ? {
              tools: activeTools().map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
              })),
            }
          : {}),
      }),
      signal,
    })
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`)
    const j = await r.json()
    const blocks: Array<Record<string, unknown>> = j.content || []
    const textBlocks = blocks.filter((b) => b.type === 'text')
    const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<{
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }>
    textOut = textBlocks.map((b) => (b as { text: string }).text).join('\n')

    if (toolUses.length === 0) return textOut

    anthMessages.push({ role: 'assistant', content: blocks })
    const toolResults = []
    for (const u of toolUses) {
      const tool = findTool(u.name)
      let resultContent: string
      let isError = false
      if (!tool) {
        resultContent = JSON.stringify({ error: `Unknown tool ${u.name}` })
        isError = true
      } else {
        try {
          const out = await tool.run(u.input || {})
          resultContent = JSON.stringify(out)
        } catch (err) {
          resultContent = JSON.stringify({ error: (err as Error).message })
          isError = true
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: u.id,
        content: resultContent,
        is_error: isError,
      })
    }
    anthMessages.push({ role: 'user', content: toolResults })
  }
  return textOut || '(tool-use round cap reached without a final answer)'
}

async function chatGemini(args: BranchArgs): Promise<string> {
  const { cfg, model, maxTokens, messages, signal } = args
  const apiKey = cfg.apiKey!
  const sys = messages.find((m) => m.role === 'system')?.content
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: rest,
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal,
  })
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
}

/** Ollama native format — POST /api/chat with {model, messages,
 *  stream:false}, response shape `{ message: { content } }`.
 *
 *  Ollama also exposes an OpenAI-compatible endpoint at /v1, but the
 *  native API tends to ship new features (think/tool-use) first and
 *  doesn't pretend to be OpenAI when it doesn't have to be. */
async function chatOllama(args: BranchArgs): Promise<string> {
  const { cfg, model, maxTokens, messages, signal } = args
  // Default baseUrl is now the Ollama root (no /v1); legacy users with
  // /v1 in their baseUrl override get it stripped here so /api/chat
  // ends up at the right path.
  const rawBase = cfg.baseUrl || DEFAULTS.ollama.baseUrl || 'http://localhost:11434'
  const root = rawBase.replace(/\/v1\/?$/, '').replace(/\/$/, '')
  const r = await fetch(`${root}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { num_predict: maxTokens },
    }),
    signal,
  })
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.message?.content ?? ''
}

interface OpenAIArgs extends BranchArgs {
  provider: AIProvider
}

async function chatOpenAICompatible(args: OpenAIArgs): Promise<string> {
  const { provider, cfg, model, maxTokens, messages, signal } = args
  const baseUrl = cfg.baseUrl || DEFAULTS[provider].baseUrl || 'https://api.openai.com/v1'

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`

  // Provider-specific extras. Most of these are recommended-not-required
  // (OpenRouter ranks apps by HTTP-Referer + X-Title), so we add them
  // best-effort.
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://mighty.app'
    headers['X-Title'] = 'Mighty Twin'
  }

  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    signal,
  })
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.choices?.[0]?.message?.content ?? ''
}

// ── Wizard test connection ─────────────────────────────────────────────

export interface TestConnectionResult {
  ok: boolean
  /** Round-trip wall-clock latency in ms (defined on ok=true). */
  latencyMs?: number
  /** Trimmed first ~80 chars of the model's response. */
  sample?: string
  /** Error message on ok=false. */
  error?: string
}

/** Send a one-shot "Hello" prompt directly to `provider` using the
 *  supplied `cfg` (apiKey, baseUrl, model). Bypasses `loadSettings()`
 *  so the wizard can probe an unsaved key before committing it to
 *  localStorage. Tools are off; max_tokens capped low; 30s timeout. */
export async function testConnection(
  provider: AIProvider,
  cfg: { apiKey?: string; baseUrl?: string; model?: string },
): Promise<TestConnectionResult> {
  const model = cfg.model || DEFAULTS[provider].model
  const messages: AIMessage[] = [{ role: 'user', content: 'Hello.' }]
  const branchArgs: BranchArgs = { cfg, model, maxTokens: 32, messages, signal: AbortSignal.timeout(30_000) }
  const t0 = performance.now()
  try {
    let out = ''
    if (provider === 'anthropic') {
      // Reuse chatAnthropic but disable the tool-use loop so the
      // wizard doesn't accidentally fire MCP tools during a probe.
      out = await chatAnthropic({ ...branchArgs, opts: { tools: false, maxToolRounds: 1 } })
    } else if (provider === 'gemini') {
      out = await chatGemini(branchArgs)
    } else if (provider === 'ollama') {
      out = await chatOllama(branchArgs)
    } else if (OPENAI_COMPAT.has(provider)) {
      out = await chatOpenAICompatible({ ...branchArgs, provider })
    } else {
      return { ok: false, error: `No fetch branch wired for provider "${provider}".` }
    }
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - t0),
      sample: out.trim().slice(0, 80),
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) }
  }
}
