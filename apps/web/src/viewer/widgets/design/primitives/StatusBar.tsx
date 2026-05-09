/** Status bar pinned to the bottom of the design widget. Mirrors v1's
 *  `.design-status-bar`: shows the active tool (or `select`), a status text
 *  hint, and the cursor lon/lat readout when the pointer is over the globe. */

interface Props {
  /** Tool name (e.g. 'point', 'box') or null when nothing is active. */
  tool: string | null
  /** Helper text — typically the current tool's hint. */
  hint?: string | null
  /** Last cursor position over the globe, or null when off-globe. */
  cursor?: { lon: number; lat: number; alt: number } | null
}

export default function StatusBar({ tool, hint, cursor }: Props) {
  return (
    <div className="design-status-bar">
      <span className="design-status-bar__tool">
        {tool ?? 'idle'}
      </span>
      <span className="design-status-bar__text">
        {hint ?? (tool ? '' : 'Select a tool to begin')}
      </span>
      {cursor && (
        <span className="design-status-bar__coords">
          {cursor.lat.toFixed(5)}°, {cursor.lon.toFixed(5)}° · {cursor.alt.toFixed(1)}m
        </span>
      )}
    </div>
  )
}
