/** Auto-save status pill — shown in the design widget header. Click to retry
 *  on error. Mirrors v1's `.design-save-badge`. */
import { Check, CloudOff, Loader, RefreshCw } from 'lucide-react'

interface Props {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: number | null
  lastError: string | null
  onRetry: () => void
}

export default function SaveIndicator({ status, lastSavedAt, lastError, onRetry }: Props) {
  const stateClass =
    status === 'error' ? 'is-error'
    : status === 'saving' ? 'is-saving'
    : 'is-saved'
  const icon =
    status === 'saving' ? <Loader size={11} className="spin" />
    : status === 'error' ? <CloudOff size={11} />
    : <Check size={11} />
  const label =
    status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Save failed'
    : lastSavedAt ? 'Saved'
    : 'Up to date'
  const title = lastError
    ? lastError
    : lastSavedAt
      ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}`
      : 'No unsaved changes'
  return (
    <span
      title={title}
      className={`dw-save-indicator ${stateClass}`}
      onClick={status === 'error' ? onRetry : undefined}
      role={status === 'error' ? 'button' : undefined}
    >
      {icon}
      {label}
      {status === 'error' && <RefreshCw size={10} />}
    </span>
  )
}
