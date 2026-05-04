/** AI provider config — BYOK only. Keys live in localStorage; nothing
 *  routes through Mighty servers. Ported from mighty-sheets/src/engine/ai.ts.
 *
 *  Phase G v1 ships Anthropic only; v2 expands to the full Sheets preset
 *  list (OpenAI, Gemini, OpenRouter, Groq, Together, Fireworks, Perplexity,
 *  Mistral, DeepSeek, xAI, Ollama, LM Studio, openai-compatible).
 */

export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'perplexity'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'ollama'
  | 'lmstudio'
  | 'openai-compatible'

export interface AIProviderConfig {
  /** API key. Empty for local providers. Stored in localStorage. */
  apiKey?: string
  /** OpenAI-compatible base URL override (Ollama, vLLM, custom). */
  baseUrl?: string
  /** Model id; defaults applied when blank. */
  model?: string
}

export interface AISettings {
  active: AIProvider
  byProvider: Partial<Record<AIProvider, AIProviderConfig>>
}

export interface AgentPreset {
  id: string
  label: string
  provider: AIProvider
  defaultModel: string
  defaultBaseUrl?: string
  flavor: 'byok' | 'local' | 'free'
  hint?: string
}

/** Curated agent list for the picker. Mirrors mighty-sheets/AGENT_PRESETS.
 *  We expose all of them in the picker; v1 only wires Anthropic in the
 *  fetch wrapper, others come online as we test them.
 */
export const AGENT_PRESETS: AgentPreset[] = [
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 — fast, cheap',  provider: 'anthropic', defaultModel: 'claude-haiku-4-5-20251001', flavor: 'byok' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced',    provider: 'anthropic', defaultModel: 'claude-sonnet-4-6',         flavor: 'byok' },
  { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7 — best quality',  provider: 'anthropic', defaultModel: 'claude-opus-4-7',           flavor: 'byok' },
  { id: 'gpt-4o-mini',       label: 'GPT-4o mini — fast, cheap',        provider: 'openai',    defaultModel: 'gpt-4o-mini',              flavor: 'byok' },
  { id: 'gpt-4o',            label: 'GPT-4o — balanced',                provider: 'openai',    defaultModel: 'gpt-4o',                   flavor: 'byok' },
  { id: 'gemini-2-flash',    label: 'Gemini 2.0 Flash — fast',          provider: 'gemini',    defaultModel: 'gemini-2.0-flash',         flavor: 'byok' },
  { id: 'gemini-2-pro',      label: 'Gemini 2.0 Pro — quality',         provider: 'gemini',    defaultModel: 'gemini-2.0-pro',           flavor: 'byok' },
  { id: 'openrouter-auto',   label: 'OpenRouter — auto-route',          provider: 'openrouter', defaultModel: 'openrouter/auto',         flavor: 'byok', hint: 'One key, hundreds of models.' },
  { id: 'groq-llama',        label: 'Groq Llama 3.3 70B — very fast',   provider: 'groq',      defaultModel: 'llama-3.3-70b-versatile',  flavor: 'byok' },
  { id: 'perplexity-sonar',  label: 'Perplexity Sonar — web search',    provider: 'perplexity', defaultModel: 'sonar',                    flavor: 'byok', hint: 'Adds live web search.' },
  { id: 'mistral-large',     label: 'Mistral Large',                     provider: 'mistral',   defaultModel: 'mistral-large-latest',     flavor: 'byok' },
  { id: 'deepseek',          label: 'DeepSeek V3',                       provider: 'deepseek',  defaultModel: 'deepseek-chat',            flavor: 'byok' },
  { id: 'xai-grok',          label: 'xAI Grok',                          provider: 'xai',       defaultModel: 'grok-2-latest',            flavor: 'byok' },
  { id: 'ollama-llama',      label: 'Ollama (local)',                    provider: 'ollama',    defaultModel: 'llama3.2', flavor: 'local', hint: 'Runs on your machine.' },
  { id: 'lmstudio-local',    label: 'LM Studio (local)',                 provider: 'lmstudio',  defaultModel: '',                          flavor: 'local' },
  { id: 'openai-compatible', label: 'Other (OpenAI-compatible URL)',     provider: 'openai-compatible', defaultModel: '',                  flavor: 'byok' },
]

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
