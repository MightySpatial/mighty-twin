/** Streaming client for the server-side Mai voxel chat route.
 *
 *  The backend at `POST /api/mai/chat` runs a Claude tool-use loop and
 *  emits SSE events (`start` / `text` / `tool_call` / `tool_result` /
 *  `done` / `error`). This module exposes an async iterator so the
 *  ChatPanel can render each event as it lands — tool-call icons,
 *  block counts, final text — without buffering the whole response.
 *
 *  The frontend's BYOK Anthropic key (from localStorage) is forwarded
 *  in the request body so the server doesn't need its own credential
 *  store. ANTHROPIC_API_KEY in the API env is the fallback for CI / the
 *  CLI test script.
 */

import { loadSettings } from './storage'

export interface MaiStreamStart { event: 'start'; model: string; site_slug: string }
export interface MaiStreamText  { event: 'text'; content: string }
export interface MaiStreamToolCall {
  event: 'tool_call'
  id: string
  name: string
  input: Record<string, unknown>
}
export interface MaiStreamToolResult {
  event: 'tool_result'
  id: string
  name: string
  result: Record<string, unknown>
  is_error: boolean
}
export interface MaiStreamDone {
  event: 'done'
  stop_reason: string
  input_tokens: number
  output_tokens: number
  rounds: number
}
export interface MaiStreamError { event: 'error'; message: string }

export type MaiStreamEvent =
  | MaiStreamStart
  | MaiStreamText
  | MaiStreamToolCall
  | MaiStreamToolResult
  | MaiStreamDone
  | MaiStreamError

export interface MaiTurn { role: 'user' | 'assistant'; content: string }

export interface MaiChatOptions {
  message: string
  siteSlug: string
  sketchId?: string
  history?: MaiTurn[]
  signal?: AbortSignal
  /** Override for the model id (defaults server-side to claude-sonnet-4-6). */
  model?: string
  /** Override for the API base URL — used by the test script. Falls back
   *  to the same origin so the browser default works without config. */
  apiBaseUrl?: string
}

/** Pull the BYOK Anthropic key from localStorage (Settings → AI). The
 *  server falls back to its env var if this is empty, so an unconfigured
 *  client still works against a server with ANTHROPIC_API_KEY set. */
function readAnthropicKey(): string | undefined {
  try {
    const settings = loadSettings()
    return settings.byProvider.anthropic?.apiKey
  } catch {
    return undefined
  }
}

/** Stream events from /api/mai/chat. Yields events as they arrive; the
 *  iterator exits on `done` or `error` (or when the caller aborts). */
export async function* streamMaiChat(opts: MaiChatOptions): AsyncIterable<MaiStreamEvent> {
  const base = (opts.apiBaseUrl ?? '').replace(/\/$/, '')
  const url = `${base}/api/mai/chat`
  const accessToken = (() => {
    try { return localStorage.getItem('accessToken') } catch { return null }
  })()

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      message: opts.message,
      site_slug: opts.siteSlug,
      sketch_id: opts.sketchId,
      conversation_history: opts.history ?? [],
      api_key: readAnthropicKey(),
      model: opts.model,
    }),
    signal: opts.signal,
  })

  if (!r.ok || !r.body) {
    let detail = `HTTP ${r.status}`
    try { detail = `${detail}: ${await r.text()}` } catch { /* ignore */ }
    yield { event: 'error', message: detail }
    return
  }

  const reader = r.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  // Each SSE message is `data: <json>\n\n`. Parse incrementally so the
  // UI can render tokens as they land.
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = chunk
        .split('\n')
        .filter(l => l.startsWith('data: '))
        .map(l => l.slice(6))
        .join('')
      if (!dataLine) continue
      try {
        const parsed = JSON.parse(dataLine) as MaiStreamEvent
        yield parsed
        if (parsed.event === 'done' || parsed.event === 'error') return
      } catch {
        // Malformed line — ignore so a single bad chunk can't kill the stream.
      }
    }
  }
}

/** Pretty-print a tool_call event for the chat surface. Each entry maps
 *  to an icon + a short label rendered alongside the call. */
export function describeToolCall(name: string): { icon: string; label: string } {
  switch (name) {
    case 'search_location':  return { icon: '🔍', label: 'Searching location' }
    case 'terrain_mask':     return { icon: '🏔', label: 'Applying terrain mask' }
    case 'pyramid_fill':     return { icon: '⛏', label: 'Drawing pit / pyramid' }
    case 'box_fill':         return { icon: '⬛', label: 'Filling block volume' }
    case 'water_fill':       return { icon: '💧', label: 'Flooding with water' }
    default:                 return { icon: '⚙', label: name }
  }
}
