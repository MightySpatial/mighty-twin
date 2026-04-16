/**
 * MightyTwin — Splash Overlay Component
 * Full-screen modal overlay for login splash, home widget, info widget, and zoom-to splash.
 */
import { useState, useEffect, useCallback } from 'react'
import './SplashOverlay.css'

export interface SplashOverlayProps {
  title: string
  message: string
  bgUrl?: string
  autoDismissSecs?: number
  onDismiss: () => void
}

export default function SplashOverlay({ title, message, bgUrl, autoDismissSecs, onDismiss }: SplashOverlayProps) {
  const [remaining, setRemaining] = useState(autoDismissSecs ?? 0)

  const dismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  // Countdown timer
  useEffect(() => {
    if (!autoDismissSecs || autoDismissSecs <= 0) return
    setRemaining(autoDismissSecs)
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          dismiss()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [autoDismissSecs, dismiss])

  // ESC to dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  return (
    <div className="splash-overlay" onClick={dismiss}>
      <div className="splash-card" onClick={e => e.stopPropagation()}>
        {bgUrl && <img className="splash-card-bg" src={bgUrl} alt="" />}
        <div className="splash-card-body">
          <h2>{title}</h2>
          <div
            className="splash-message"
            dangerouslySetInnerHTML={{ __html: message }}
          />
          {autoDismissSecs != null && autoDismissSecs > 0 && remaining > 0 && (
            <div className="splash-countdown">Auto-dismiss in {remaining}s</div>
          )}
          <button className="splash-dismiss-btn" onClick={dismiss}>Got it</button>
        </div>
      </div>
    </div>
  )
}
