/** Bottom drawer handle shown when the design widget is minimised on
 *  mobile. The handle is its own fixed element so it can slide up
 *  independently of the widget sliding down — both transitions run at
 *  the same time, giving a clean tray-swap feel.
 *
 *  Tap the chevron / handle bar to expand the full widget back; tap the
 *  cancel × to bail out of the active tool (which auto-restores). */
import { ChevronUp, X } from 'lucide-react'

const TOOL_ICON: Record<string, string> = {
  point: '●',
  line: '╱',
  polygon: '⬡',
  rectangle: '▭',
  circle: '○',
  traverse: '⟁',
  box: '⬚',
  pit: '⊔',
  cylinder: '⊙',
  select: '↖',
}

interface Props {
  /** Whether the handle should be slid up into view. */
  visible: boolean
  /** Active tool (drives the icon + name). Null when the widget was minimised
   *  manually with no draw in progress — handle still shows but tool-name area
   *  becomes a generic "Design widget" affordance. */
  tool: string | null
  /** Optional contextual hint shown to the right of the tool name. */
  hint?: string | null
  /** Expand the widget back to full screen. */
  onExpand: () => void
  /** Cancel the current tool. Auto-restores via the parent's effect. */
  onCancel: () => void
}

export default function MobileMinimiseHandle({ visible, tool, hint, onExpand, onCancel }: Props) {
  const icon = tool ? TOOL_ICON[tool] ?? '✏️' : '⌘'
  const name = tool ?? 'Design widget'

  return (
    <div
      className={`dw-mobile-handle${visible ? ' is-visible' : ''}`}
      role="region"
      aria-label="Design widget minimised drawer"
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="dw-mobile-handle__expand"
        onClick={onExpand}
        title="Expand design widget"
        aria-label="Expand design widget"
      >
        <ChevronUp size={18} />
      </button>
      <span className="dw-mobile-handle__icon" aria-hidden>{icon}</span>
      <div className="dw-mobile-handle__text">
        <span className="dw-mobile-handle__name">{name}</span>
        {hint && <span className="dw-mobile-handle__hint">{hint}</span>}
      </div>
      {tool && (
        <button
          type="button"
          className="dw-mobile-handle__cancel"
          onClick={onCancel}
          title="Cancel tool"
          aria-label="Cancel tool"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
