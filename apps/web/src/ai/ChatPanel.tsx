/** Right-rail AI chat panel — always-on per the Mighty UX system.
 *
 *  Two modes:
 *   • Plain BYOK chat — direct browser-to-Anthropic via `client.ts`.
 *   • Voxel mode — when `useMaiVoxelContext()` returns a context (set by
 *     the design widget when a voxel layer activates), the panel routes
 *     through the server-side `/api/mai/chat` SSE endpoint so Claude
 *     can call voxel tools (search_location, terrain_mask, pyramid_fill,
 *     box_fill, water_fill) and the panel renders each tool call /
 *     result inline as it streams in.
 *
 *  Knows nothing about the surrounding shell beyond its own dimensions.
 *  The shell decides where to mount it (right rail in Map / Atlas).
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, ChevronsRight, ChevronUp, Boxes } from 'lucide-react'
import { chat, MissingApiKeyError } from './client'
import { loadSettings } from './storage'
import { useMaiVoxelContext } from './voxelContext'
import { describeToolCall, streamMaiChat, type MaiStreamEvent } from './voxelChat'
import type { AIMessage } from './types'

interface ToolEvent {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  result?: Record<string, unknown>
}

interface ChatTurn {
  role: 'user' | 'assistant' | 'error'
  content: string
  /** Voxel-mode only: tool calls Claude executed during this turn. */
  toolEvents?: ToolEvent[]
}

export default function ChatPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [isMinimised, setIsMinimised] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const voxelCtx = useMaiVoxelContext()

  // Auto-scroll to bottom on new turn / streaming update.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, pending])

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  // External minimise control: design widget overlay opens → minimise to
  // give the canvas + design tools room to breathe; closes → expand back.
  useEffect(() => {
    const onOpen = () => setIsMinimised(true)
    const onClose = () => setIsMinimised(false)
    window.addEventListener('design:open', onOpen)
    window.addEventListener('design:close', onClose)
    return () => {
      window.removeEventListener('design:open', onOpen)
      window.removeEventListener('design:close', onClose)
    }
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || pending) return
    setInput('')
    const userTurn: ChatTurn = { role: 'user', content: text }
    setTurns((prev) => [...prev, userTurn])
    setPending(true)

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      if (voxelCtx) {
        await runVoxelTurn({
          text,
          ctx: voxelCtx,
          history: turns,
          setTurns,
          signal: ctrl.signal,
        })
      } else {
        await runPlainTurn({
          text,
          history: turns,
          setTurns,
          signal: ctrl.signal,
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const detail =
        err instanceof MissingApiKeyError
          ? `${err.message} (Settings → AI)`
          : (err as Error).message
      setTurns((prev) => [...prev, { role: 'error', content: detail }])
    } finally {
      setPending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const settings = loadSettings()
  const cfg = settings.byProvider[settings.active]
  const modelLabel = cfg?.model || 'unconfigured'

  const lastTurn = [...turns].reverse().find((t) => t.role === 'assistant')

  if (isMinimised) {
    return (
      <aside
        style={{
          width: 360,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'rgba(15,15,20,0.94)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {lastTurn && (
          <div
            style={{
              padding: '8px 12px',
              fontSize: 12,
              opacity: 0.6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'rgba(255,255,255,0.9)',
            }}
            title={lastTurn.content}
          >
            {lastTurn.content}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <input
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              padding: '6px 10px',
              color: 'inherit',
              fontSize: 13,
            }}
            placeholder="Ask Mai (Mighty AI)…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
          <button
            onClick={() => setIsMinimised(false)}
            title="Expand"
            aria-label="Expand"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              padding: '4px 6px',
            }}
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      style={{
        width: 360,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15,15,20,0.94)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <header
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Sparkles size={18} color="#a78bfa" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Mai (Mighty AI)</div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={`${settings.active} · ${modelLabel}`}
          >
            {settings.active} · {modelLabel}
          </div>
        </div>
        <button
          onClick={() => setIsMinimised(true)}
          title="Minimise"
          aria-label="Minimise"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)',
            padding: '4px 6px',
          }}
        >
          <ChevronsRight size={16} />
        </button>
      </header>

      {voxelCtx && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(45,212,191,0.08)',
            borderBottom: '1px solid rgba(45,212,191,0.25)',
            color: '#5eead4',
            fontSize: 11,
          }}
          title="Mai is in voxel mode — tools execute server-side"
        >
          <Boxes size={13} />
          <span style={{ fontWeight: 600 }}>Voxel mode</span>
          <span style={{ opacity: 0.65 }}>·</span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{voxelCtx.layerName}</span>
          <span style={{ opacity: 0.65 }}>L{voxelCtx.blockLevel}</span>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        {turns.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5 }}>
            {voxelCtx
              ? `Ask Mai to draw shapes in your voxel layer. Try "Draw an open cut mine pit, 500m wide, 200m deep, 45° walls, at the centre of the site".`
              : `Ask anything about the current site. Tool use (camera control, layer toggles, measurements, annotations) lands in v1.1 — for now this is plain chat.`}
          </div>
        )}
        {turns.map((t, i) => (
          <Turn key={i} turn={t} />
        ))}
        {pending && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>…</div>
        )}
      </div>

      <div
        style={{
          padding: 10,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          gap: 8,
        }}
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={voxelCtx ? 'Describe a shape or location…' : 'Ask Mai (Mighty AI)…'}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.9)',
            font: 'inherit',
            fontSize: 13,
            resize: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || pending}
          aria-label="Send"
          title="Send (Enter)"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: voxelCtx ? '#2dd4bf' : '#6366f1',
            color: voxelCtx ? '#042f2e' : '#fff',
            border: 'none',
            cursor: input.trim() && !pending ? 'pointer' : 'not-allowed',
            opacity: input.trim() && !pending ? 1 : 0.5,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </aside>
  )
}

// ── Turn renderers ──────────────────────────────────────────────────────

function Turn({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user'
  const isError = turn.role === 'error'
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '8px 10px',
        borderRadius: 8,
        background: isUser
          ? 'rgba(99,102,241,0.14)'
          : isError
          ? 'rgba(248,113,113,0.10)'
          : 'rgba(255,255,255,0.03)',
        border: isError ? '1px solid rgba(248,113,113,0.3)' : 'none',
        color: isError ? '#fca5a5' : 'rgba(255,255,255,0.92)',
        fontSize: 13,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {turn.toolEvents?.map(ev => <ToolEventRow key={ev.id} ev={ev} />)}
      {turn.content}
    </div>
  )
}

function ToolEventRow({ ev }: { ev: ToolEvent }) {
  const meta = describeToolCall(ev.name)
  const blocks = (ev.result?.blocks_added as number | undefined) ?? null
  const blockSize = (ev.result?.block_size_m as number | undefined) ?? null
  const stub = ev.result?.stub === true
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 6px',
        marginBottom: 4,
        background: 'rgba(45,212,191,0.06)',
        border: '1px solid rgba(45,212,191,0.2)',
        borderRadius: 6,
        fontSize: 11,
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      <span style={{ fontSize: 14 }}>{meta.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {ev.status === 'running' && `${meta.label}…`}
        {ev.status === 'done' && (
          blocks !== null
            ? `Added ${blocks.toLocaleString()} blocks${blockSize ? ` at ${formatBlockSize(blockSize)}` : ''}${stub ? ' (stub)' : ''}`
            : `${meta.label} · ok${stub ? ' (stub)' : ''}`
        )}
        {ev.status === 'error' && `${meta.label} · failed`}
      </span>
    </div>
  )
}

function formatBlockSize(m: number): string {
  if (m < 1) return `${(m * 100).toFixed(0)}cm`
  return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`
}

// ── Mode runners ────────────────────────────────────────────────────────

interface RunOpts {
  text: string
  history: ChatTurn[]
  setTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>
  signal: AbortSignal
}

async function runPlainTurn(opts: RunOpts): Promise<void> {
  const messages: AIMessage[] = [
    {
      role: 'system',
      content:
        'You are an AI assistant inside MightyTwin, a spatial digital-twin app. Be concise; you can reference the user\'s current site and selection in conversation. Tool use comes online in a future release.',
    },
    ...opts.history.filter((t) => t.role !== 'error').map((t) => ({
      role: t.role as 'user' | 'assistant',
      content: t.content,
    })),
    { role: 'user', content: opts.text },
  ]
  const reply = await chat(messages, { signal: opts.signal })
  opts.setTurns((prev) => [...prev, { role: 'assistant', content: reply }])
}

interface VoxelRunOpts extends RunOpts {
  ctx: { siteSlug: string; sketchId?: string }
}

async function runVoxelTurn(opts: VoxelRunOpts): Promise<void> {
  // Add a placeholder assistant turn that we'll update as events stream in.
  const initialTurn: ChatTurn = { role: 'assistant', content: '', toolEvents: [] }
  opts.setTurns((prev) => [...prev, initialTurn])

  const updateLast = (mut: (t: ChatTurn) => ChatTurn) => {
    opts.setTurns((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      next[next.length - 1] = mut(next[next.length - 1])
      return next
    })
  }

  const history = opts.history
    .filter(t => t.role === 'user' || t.role === 'assistant')
    .map(t => ({ role: t.role as 'user' | 'assistant', content: t.content }))

  for await (const ev of streamMaiChat({
    message: opts.text,
    siteSlug: opts.ctx.siteSlug,
    sketchId: opts.ctx.sketchId,
    history,
    signal: opts.signal,
  })) {
    applyEvent(ev, updateLast)
  }
}

function applyEvent(ev: MaiStreamEvent, updateLast: (mut: (t: ChatTurn) => ChatTurn) => void) {
  if (ev.event === 'text') {
    updateLast(t => ({ ...t, content: (t.content || '') + ev.content }))
    return
  }
  if (ev.event === 'tool_call') {
    updateLast(t => ({
      ...t,
      toolEvents: [
        ...(t.toolEvents ?? []),
        { id: ev.id, name: ev.name, input: ev.input, status: 'running' },
      ],
    }))
    return
  }
  if (ev.event === 'tool_result') {
    updateLast(t => ({
      ...t,
      toolEvents: (t.toolEvents ?? []).map(te =>
        te.id === ev.id
          ? { ...te, status: ev.is_error ? 'error' : 'done', result: ev.result }
          : te,
      ),
    }))
    return
  }
  if (ev.event === 'error') {
    updateLast(t => ({ ...t, content: t.content || `Error: ${ev.message}` }))
    return
  }
  // start / done — no UI change needed.
}
