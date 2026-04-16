/**
 * MightyTwin — Toast Notification System
 * Provides addToast() via React context + renders a toast stack overlay.
 */
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react'

type ToastType = 'error' | 'success' | 'info' | 'warning'

interface Toast {
  id: number
  type: ToastType
  message: string
  exiting?: boolean
}

interface ToastContextType {
  addToast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let nextId = 0

const TOAST_DURATION = 5000
const EXIT_DURATION = 300

const icons: Record<ToastType, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertCircle,
  success: CheckCircle,
  info: Info,
}

const colors: Record<ToastType, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  info: '#6366f1',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, EXIT_DURATION)
  }, [])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId
    setToasts(prev => [...prev.slice(-4), { id, type, message }])
    setTimeout(() => removeToast(id), TOAST_DURATION)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 'calc(60px + var(--safe-top, 0px))',
          right: 16,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 400,
          pointerEvents: 'none',
        }}>
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const Icon = icons[toast.type]
  const color = colors[toast.type]

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const opacity = toast.exiting ? 0 : visible ? 1 : 0
  const translateX = toast.exiting ? 120 : visible ? 0 : 120

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '12px 14px',
      background: 'rgba(26, 26, 36, 0.95)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      color: '#fff',
      fontSize: 13,
      lineHeight: 1.4,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      pointerEvents: 'auto',
      transition: `opacity ${EXIT_DURATION}ms ease, transform ${EXIT_DURATION}ms ease`,
      opacity,
      transform: `translateX(${translateX}px)`,
    }}>
      <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
