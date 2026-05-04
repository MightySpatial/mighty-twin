/** AI fetch wrapper — BYOK, multi-provider. Ported from
 *  mighty-sheets/src/engine/ai.ts. Same pattern: keys read from
 *  localStorage, requests go directly to the provider's endpoint, no
 *  Mighty-managed inference.
 */

import { loadSettings } from './storage'
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
  ollama:              { model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' },
  lmstudio:            { model: '', baseUrl: 'http://localhost:1234/v1' },
  'openai-compatible': { model: '' },
}

export interface ChatOptions {
  maxTokens?: number
  /** Optional abort signal — bound to the React unmount cleanup. */
  signal?: AbortSignal
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
  const cfg = settings.byProvider[settings.active] ?? {}
  const model = cfg.model || DEFAULTS[settings.active].model
  const maxTokens = opts.maxTokens ?? 1200
  const signal = opts.signal

  // Anthropic — direct browser access
  if (settings.active === 'anthropic') {
    if (!cfg.apiKey) throw new MissingApiKeyError('anthropic')
    const sys = messages.find((m) => m.role === 'system')?.content
    const rest = messages.filter((m) => m.role !== 'system')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: rest }),
      signal,
    })
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`)
    const j = await r.json()
    return j.content?.[0]?.text ?? ''
  }

  // Gemini — its own envelope
  if (settings.active === 'gemini') {
    if (!cfg.apiKey) throw new MissingApiKeyError('gemini')
    const sys = messages.find((m) => m.role === 'system')?.content
    const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
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

  // OpenAI-compatible (covers OpenAI, OpenRouter, Groq, Together, Fireworks,
  // Perplexity, Mistral, DeepSeek, xAI, Ollama, LM Studio, custom)
  const baseUrl = cfg.baseUrl || DEFAULTS[settings.active].baseUrl || 'https://api.openai.com/v1'
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    signal,
  })
  if (!r.ok) throw new Error(`${settings.active} ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.choices?.[0]?.message?.content ?? ''
}
