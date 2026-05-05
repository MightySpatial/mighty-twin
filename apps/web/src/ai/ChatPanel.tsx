/** Right-rail AI chat panel — always-on per the Mighty UX system.
 *
 *  v1: plain text in/out, no MCP tool calls yet. The chat history is
 *  in-memory only (lost on reload); persistence + tool execution come
 *  in subsequent commits.
 *
 *  Knows nothing about the surrounding shell beyond its own dimensions.
 *  The shell decides where to mount it (right rail in Map / Atlas).
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import { chat, MissingApiKeyError } from './client'
import { loadSettings } from './storage'
import type { AIMessage } from './types'

interface ChatTurn {
  role: 'user' | 'assistant' | 'error'
  content: string
}

export default function ChatPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom on new turn.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, pending])

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

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
      const messages: AIMessage[] = [
        {
          role: 'system',
          content:
            'You are an AI assistant inside MightyTwin, a spatial digital-twin app. Be concise; you can reference the user\'s current site and selection in conversation. Tool use comes online in a future release.',
        },
        ...turns.filter((t) => t.role !== 'error').map((t) => ({
          role: t.role as 'user' | 'assistant',
          content: t.content,
        })),
        { role: 'user', content: text },
      ]
      const reply = await chat(messages, { signal: ctrl.signal })
      setTurns((prev) => [...prev, { role: 'assistant', content: reply }])
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
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Mighty AI</div>
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
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        {turns.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5 }}>
            Ask anything about the current site. Tool use (camera control, layer
            toggles, measurements, annotations) lands in v1.1 — for now this is
            plain chat.
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
          placeholder="Ask Mighty AI…"
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
            background: '#6366f1',
            color: '#fff',
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
      {turn.content}
    </div>
  )
}
