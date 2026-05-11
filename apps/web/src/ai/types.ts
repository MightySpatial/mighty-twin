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

/** Features that can route to a different provider/model than the
 *  default active one. Mirrors the labels in the Settings → AI →
 *  Per-feature overrides table. */
export type AIFeature = 'mai' | 'voxel' | 'storymap' | 'featureedit' | 'bulktransform'

export interface AIFeatureOverride {
  provider: AIProvider
  model: string
}

/** Approval scopes for AI tool use. */
export type AIApprovalScope = 'read' | 'write' | 'admin'
/** What happens when a tool of this scope wants to fire. */
export type AIApprovalMode = 'auto' | 'ask' | 'disabled'

export interface AISettings {
  active: AIProvider
  byProvider: Partial<Record<AIProvider, AIProviderConfig>>
  /** Right-rail Mighty AI panel visibility. Defaults to true. */
  aiPanelVisible?: boolean
  /** Per-feature provider/model overrides. Unset entries fall back to
   *  the active provider's default. */
  featureOverrides?: Partial<Record<AIFeature, AIFeatureOverride>>
  /** Per-scope approval mode for tool calls. Defaults: read=auto,
   *  write=ask, admin=ask. */
  approvalPolicy?: Partial<Record<AIApprovalScope, AIApprovalMode>>
}

export const DEFAULT_APPROVAL_POLICY: Record<AIApprovalScope, AIApprovalMode> = {
  read: 'auto',
  write: 'ask',
  admin: 'ask',
}

export interface AIFeatureSpec {
  id: AIFeature
  label: string
  description: string
}

export const AI_FEATURES: AIFeatureSpec[] = [
  { id: 'mai',           label: 'Mai (chat assistant)',     description: 'The model used in the Mai right-rail panel for general questions and commands.' },
  { id: 'voxel',         label: 'Voxel design assistant',   description: 'Used for "draw this mine layout" and natural-language block generation commands.' },
  { id: 'storymap',      label: 'Story map narration',      description: 'Drafts slide text and transition descriptions from your layer data.' },
  { id: 'featureedit',   label: 'Feature edit suggestions', description: 'Suggests attribute values and geometry corrections during feature editing.' },
  { id: 'bulktransform', label: 'Bulk data transformations', description: 'Applied to hundreds or thousands of features. Cost-aware model recommended.' },
]

export interface AIApprovalSpec {
  id: AIApprovalScope
  label: string
  description: string
  /** Which modes are sensible for this scope. read drops `disabled`
   *  since blocking reads makes the assistant near-useless. */
  modes: AIApprovalMode[]
}

export const AI_APPROVAL_SCOPES: AIApprovalSpec[] = [
  { id: 'read',  label: 'Read tools',               description: 'Layer queries, attribute lookups, site info — no writes.',                modes: ['auto', 'ask'] },
  { id: 'write', label: 'Draw and edit tools',      description: 'Block placement, feature geometry edits, attribute writes.',             modes: ['ask', 'auto'] },
  { id: 'admin', label: 'Site and layer management', description: 'Create/delete sites, upload data, change layer visibility.',             modes: ['ask', 'disabled'] },
]

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

/** Display metadata for the provider card grid + wizard. Logo class
 *  names map to gradient backgrounds in AISettings.css. Glyph is the
 *  single character/symbol shown inside the coloured square. */
export interface ProviderDisplay {
  id: AIProvider
  name: string
  glyph: string
  logoClass: string
  description: string
  /** Pills on the card meta row, e.g. ['API key', '200+ models']. */
  metaPills: string[]
  /** Where to get the key. Rendered as a link in the wizard hint. */
  keyDocsLabel?: string
  keyDocsUrl?: string
  /** Placeholder shown in the key/baseUrl input. */
  keyPlaceholder: string
  /** Local providers and the custom slot don't need a key — the wizard
   *  swaps the field label to "Base URL" and skips the docs link. */
  keyless: boolean
  /** Models shown as tiles in step 2. The first is the default. */
  models: { id: string; label: string; meta: string }[]
}

export const PROVIDER_DISPLAY: Record<AIProvider, ProviderDisplay> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    glyph: 'A',
    logoClass: 'logo-anthropic',
    description: 'Claude Haiku, Sonnet, and Opus. Best reasoning, tool use, and long context.',
    metaPills: ['API key'],
    keyDocsLabel: 'console.anthropic.com',
    keyDocsUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-api03-…',
    keyless: false,
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5', meta: 'Fastest · cheapest · great for commands' },
      { id: 'claude-sonnet-4-6',         label: 'claude-sonnet-4-6', meta: 'Balanced · recommended default' },
      { id: 'claude-opus-4-7',           label: 'claude-opus-4-7',   meta: 'Most capable · highest cost' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    glyph: '∞',
    logoClass: 'logo-openai',
    description: 'GPT-4o and GPT-4o-mini. Broad capability with strong code and vision.',
    metaPills: ['API key'],
    keyDocsLabel: 'platform.openai.com',
    keyDocsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-proj-…',
    keyless: false,
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', meta: 'Fast · cheap · good default' },
      { id: 'gpt-4o',      label: 'gpt-4o',      meta: 'Balanced · multimodal' },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    glyph: '✦',
    logoClass: 'logo-gemini',
    description: 'Gemini 2.0 Flash and Pro. Fast, multimodal, good for map and spatial tasks.',
    metaPills: ['API key'],
    keyDocsLabel: 'aistudio.google.com',
    keyDocsUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    keyless: false,
    models: [
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash', meta: 'Fast · cheap · multimodal' },
      { id: 'gemini-2.0-pro',   label: 'gemini-2.0-pro',   meta: 'Quality · long context' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    glyph: '⊕',
    logoClass: 'logo-openrouter',
    description: 'One key, hundreds of models. Route to Claude, GPT, Llama, Mistral, and more.',
    metaPills: ['API key', '200+ models'],
    keyDocsLabel: 'openrouter.ai',
    keyDocsUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-…',
    keyless: false,
    models: [
      { id: 'openrouter/auto',                  label: 'openrouter/auto',         meta: 'Let OpenRouter pick the best model' },
      { id: 'anthropic/claude-3.5-sonnet',      label: 'anthropic/claude-3.5-sonnet', meta: 'Routed Claude' },
      { id: 'openai/gpt-4o',                    label: 'openai/gpt-4o',           meta: 'Routed GPT-4o' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'llama-3.3-70b',          meta: 'Open weights' },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    glyph: '⚡',
    logoClass: 'logo-groq',
    description: 'Llama 3.3 and Mixtral at inference speeds an order of magnitude faster than GPU.',
    metaPills: ['API key', 'Ultra-low latency'],
    keyDocsLabel: 'console.groq.com',
    keyDocsUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    keyless: false,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile', meta: 'Recommended default' },
      { id: 'llama-3.1-8b-instant',    label: 'llama-3.1-8b-instant',    meta: 'Cheapest · sub-second' },
      { id: 'mixtral-8x7b-32768',      label: 'mixtral-8x7b-32768',      meta: 'Long context' },
    ],
  },
  together: {
    id: 'together',
    name: 'Together',
    glyph: 'T',
    logoClass: 'logo-together',
    description: 'OSS models at scale. Llama, Mixtral, and 50+ open-weights options.',
    metaPills: ['API key'],
    keyDocsLabel: 'api.together.xyz',
    keyDocsUrl: 'https://api.together.xyz/settings/api-keys',
    keyPlaceholder: 'tgp_…',
    keyless: false,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama-3.3-70B-Turbo', meta: 'Recommended default' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',    label: 'Mixtral-8x7B',        meta: 'Strong open weights' },
    ],
  },
  fireworks: {
    id: 'fireworks',
    name: 'Fireworks',
    glyph: '🔥',
    logoClass: 'logo-fireworks',
    description: 'Llama 3.1 405B and dedicated function-calling models. Fast hosted OSS.',
    metaPills: ['API key'],
    keyDocsLabel: 'fireworks.ai',
    keyDocsUrl: 'https://fireworks.ai/account/api-keys',
    keyPlaceholder: 'fw_…',
    keyless: false,
    models: [
      { id: 'accounts/fireworks/models/llama-v3p1-405b-instruct', label: 'llama-3.1-405b', meta: 'Largest hosted OSS' },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',  label: 'llama-3.3-70b',  meta: 'Balanced' },
    ],
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    glyph: '⊗',
    logoClass: 'logo-perplexity',
    description: 'Sonar adds live web search to every prompt. Good for real-world context and standards lookups.',
    metaPills: ['API key', 'Web search'],
    keyDocsLabel: 'perplexity.ai',
    keyDocsUrl: 'https://www.perplexity.ai/settings/api',
    keyPlaceholder: 'pplx-…',
    keyless: false,
    models: [
      { id: 'sonar',         label: 'sonar',         meta: 'Default · web-grounded' },
      { id: 'sonar-pro',     label: 'sonar-pro',     meta: 'Deeper search · higher quality' },
    ],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    glyph: 'M',
    logoClass: 'logo-mistral',
    description: 'Mistral Large and Codestral. Strong European option with on-prem deployment path.',
    metaPills: ['API key'],
    keyDocsLabel: 'console.mistral.ai',
    keyDocsUrl: 'https://console.mistral.ai/api-keys/',
    keyPlaceholder: '…',
    keyless: false,
    models: [
      { id: 'mistral-large-latest',  label: 'mistral-large-latest', meta: 'Flagship' },
      { id: 'mistral-small-latest',  label: 'mistral-small-latest', meta: 'Cheap · fast' },
      { id: 'codestral-latest',      label: 'codestral-latest',     meta: 'Code' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    glyph: '◇',
    logoClass: 'logo-deepseek',
    description: 'DeepSeek V3. Strong reasoning at very low cost. Good for high-volume spatial queries.',
    metaPills: ['API key', 'Low cost'],
    keyDocsLabel: 'platform.deepseek.com',
    keyDocsUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-…',
    keyless: false,
    models: [
      { id: 'deepseek-chat',      label: 'deepseek-chat',      meta: 'V3 chat' },
      { id: 'deepseek-reasoner',  label: 'deepseek-reasoner',  meta: 'R1 reasoning' },
    ],
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    glyph: '𝕏',
    logoClass: 'logo-xai',
    description: 'Grok with real-time knowledge. Long context, competitive reasoning benchmark scores.',
    metaPills: ['API key'],
    keyDocsLabel: 'console.x.ai',
    keyDocsUrl: 'https://console.x.ai/',
    keyPlaceholder: 'xai-…',
    keyless: false,
    models: [
      { id: 'grok-2-latest', label: 'grok-2-latest', meta: 'Default' },
      { id: 'grok-2-mini',   label: 'grok-2-mini',   meta: 'Cheap · fast' },
    ],
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    glyph: '⌂',
    logoClass: 'logo-ollama',
    description: 'Run Llama, Mistral, Gemma and others locally. No key needed — data never leaves your machine.',
    metaPills: ['No key', 'Local only', 'localhost:11434'],
    keyPlaceholder: 'http://localhost:11434',
    keyless: true,
    models: [
      { id: 'llama3.2',  label: 'llama3.2',  meta: 'Latest Meta · small' },
      { id: 'llama3.1',  label: 'llama3.1',  meta: '8B / 70B / 405B' },
      { id: 'mistral',   label: 'mistral',   meta: '7B' },
      { id: 'gemma2',    label: 'gemma2',    meta: 'Google open weights' },
    ],
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    glyph: '◈',
    logoClass: 'logo-lmstudio',
    description: 'OpenAI-compatible local server. Any GGUF model, runs entirely on your hardware.',
    metaPills: ['No key', 'localhost:1234'],
    keyPlaceholder: 'http://localhost:1234/v1',
    keyless: true,
    models: [
      { id: '', label: 'Use loaded model', meta: 'Whatever LM Studio has open' },
    ],
  },
  'openai-compatible': {
    id: 'openai-compatible',
    name: 'Custom endpoint',
    glyph: '⚙',
    logoClass: 'logo-custom',
    description: 'Any OpenAI-compatible API. Point at Azure, vLLM, or your own deployment.',
    metaPills: ['OpenAI-compatible'],
    keyPlaceholder: 'https://api.example.com/v1',
    keyless: true,
    models: [
      { id: '', label: 'Custom model', meta: 'Set in Manage → Step 2' },
    ],
  },
}

/** Card display order — hosted first, then local. Mirrors the mockup. */
export const PROVIDER_ORDER: { group: 'hosted' | 'local'; ids: AIProvider[] }[] = [
  { group: 'hosted', ids: ['anthropic', 'openai', 'gemini', 'openrouter', 'groq', 'together', 'fireworks', 'perplexity', 'mistral', 'deepseek', 'xai'] },
  { group: 'local',  ids: ['ollama', 'lmstudio', 'openai-compatible'] },
]
