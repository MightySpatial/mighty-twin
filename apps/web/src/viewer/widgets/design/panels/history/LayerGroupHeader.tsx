/** Collapsible group header used in both By-Layer and By-Type history views.
 *  When `colour` is provided it shows a layer-coloured dot; otherwise it's a
 *  plain group title (e.g. "Points · 3"). */

interface Props {
  collapsed: boolean
  onToggle: () => void
  colour?: string
  name: string
  count: number
}

export default function LayerGroupHeader({ collapsed, onToggle, colour, name, count }: Props) {
  return (
    <div className="design-layer-header" onClick={onToggle}>
      <span className="design-layer-chevron">{collapsed ? '▸' : '▾'}</span>
      {colour && <span className="design-layer-dot" style={{ background: colour }} />}
      <span className="design-layer-name">{name}</span>
      <span className="design-layer-count">{count}</span>
    </div>
  )
}
