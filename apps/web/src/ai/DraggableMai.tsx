/**
 * DraggableMai — floating, repositionable AI panel.
 *
 * Desktop: fixed floating window, draggable anywhere by the grip handle.
 *          Position survives tab navigation (sessionStorage).
 * Phone:   draggable sparkle FAB + bottom sheet.
 *          The FAB can be long-pressed/dragged to reposition; a tap opens
 *          the chat sheet.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import ChatPanel from './ChatPanel'

const POS_KEY = 'mighty:mai:pos'
const FAB_KEY = 'mighty:mai:fab'

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function savePos(p: { x: number; y: number }) {
  try { sessionStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
}

function loadFabPos(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(FAB_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveFabPos(p: { x: number; y: number }) {
  try { sessionStorage.setItem(FAB_KEY, JSON.stringify(p)) } catch {}
}

function defaultDesktopPos() {
  return { x: Math.max(0, window.innerWidth - 380), y: 64 }
}
function defaultFabPos() {
  return { x: window.innerWidth - 70, y: window.innerHeight - 152 }
}

/** Top-level entry point — renders the right widget for the current breakpoint. */
export function DraggableMai() {
  const [isPhone, setIsPhone] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isPhone ? <MaiFab /> : <MaiDesktop />
}

/* ──────────────────────────────────────────────────────────────────────────
   DESKTOP: floating draggable panel
─────────────────────────────────────────────────────────────────────────── */
function MaiDesktop() {
  const [pos, setPos] = useState(() => loadPos() ?? defaultDesktopPos())
  const dragging = useRef(false)
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const clamp = useCallback((p: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(window.innerWidth - 360, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - 80, p.y)),
  }), [])

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const next = clamp({
        x: origin.current.px + (ev.clientX - origin.current.mx),
        y: origin.current.py + (ev.clientY - origin.current.my),
      })
      setPos(next)
      savePos(next)
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 360,
        maxHeight: 'calc(100vh - 80px)',
        zIndex: 8000,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
        background: 'rgba(15,15,20,0.97)',
      }}
    >
      {/* Drag grip */}
      <div
        onMouseDown={onHeaderMouseDown}
        title="Drag to reposition"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 22,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, letterSpacing: 4 }}>
          ⠿ ⠿ ⠿
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ChatPanel />
      </div>
    </div>,
    document.body,
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   PHONE: draggable FAB + bottom sheet
─────────────────────────────────────────────────────────────────────────── */
function MaiFab() {
  const [fabPos, setFabPos] = useState(() => loadFabPos() ?? defaultFabPos())
  const [sheetOpen, setSheetOpen] = useState(false)
  const touchOrigin = useRef({ tx: 0, ty: 0, px: 0, py: 0, moved: false })

  const clampFab = useCallback((p: { x: number; y: number }) => ({
    x: Math.max(8, Math.min(window.innerWidth - 62, p.x)),
    y: Math.max(8, Math.min(window.innerHeight - 62, p.y)),
  }), [])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchOrigin.current = { tx: t.clientX, ty: t.clientY, px: fabPos.x, py: fabPos.y, moved: false }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const dx = t.clientX - touchOrigin.current.tx
    const dy = t.clientY - touchOrigin.current.ty
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      touchOrigin.current.moved = true
      const next = clampFab({ x: touchOrigin.current.px + dx, y: touchOrigin.current.py + dy })
      setFabPos(next)
      saveFabPos(next)
    }
  }
  const onTouchEnd = () => {
    if (!touchOrigin.current.moved) setSheetOpen(true)
  }

  return createPortal(
    <>
      {/* FAB */}
      <button
        type="button"
        aria-label="Open Mighty AI"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (!touchOrigin.current.moved) setSheetOpen(true) }}
        style={{
          position: 'fixed',
          left: fabPos.x,
          top: fabPos.y,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(167,139,250,0.45)',
          zIndex: 8000,
          touchAction: 'none',
        }}
      >
        <Sparkles size={22} />
      </button>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 8100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            style={{
              width: '100%',
              height: '70vh',
              background: 'rgba(15,15,20,0.98)',
              backdropFilter: 'blur(16px)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 36,
                height: 4,
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 2,
                margin: '8px auto 4px',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ChatPanel />
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
