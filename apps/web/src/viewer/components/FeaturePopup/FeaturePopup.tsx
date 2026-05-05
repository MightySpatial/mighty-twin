/** FeaturePopup — leader-line anchored summary card.
 *
 *  Renders next to the picked feature on the canvas. Shows the feature
 *  name, top 3 attributes, and a "View attributes" button that opens
 *  the FeatureAttributesDrawer with the full bag.
 *
 *  Per Rahman's UX feedback (T+30), popups should NOT sit centred —
 *  they should anchor to the feature with a leader line. The card is
 *  placed offset from the anchor and a thin diagonal connects them.
 *
 *  On mobile the card pins to the bottom of the canvas instead of
 *  hovering the anchor (touch targets, screen real estate).
 */

import { Maximize2, X } from 'lucide-react'
import type { PickedFeature, ScreenAnchor } from './useFeatureClick'

interface Props {
  picked: PickedFeature
  anchor: ScreenAnchor | null
  isMobile: boolean
  onClose: () => void
  onOpenDrawer: () => void
}

const TOP_FIELDS_TO_SKIP = new Set([
  'name',
  'NAME',
  'id',
  'ID',
  'objectid',
  'OBJECTID',
  'layer',
  'layer_id',
  'source',
])

export default function FeaturePopup({ picked, anchor, isMobile, onClose, onOpenDrawer }: Props) {
  const summaryFields = Object.entries(picked.attributes)
    .filter(([k, v]) => !TOP_FIELDS_TO_SKIP.has(k) && v != null && v !== '')
    .slice(0, 3)

  if (isMobile) {
    return (
      <div
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 80,
          zIndex: 12,
          padding: 14,
          background: 'rgba(17,20,29,0.96)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          color: '#f0f2f8',
        }}
      >
        <PopupBody
          picked={picked}
          summaryFields={summaryFields}
          onClose={onClose}
          onOpenDrawer={onOpenDrawer}
        />
      </div>
    )
  }

  // Desktop: leader-line popup placed near the anchor.
  if (!anchor || !anchor.visible) return null
  // Place the card to the upper-right of the anchor, but if it would
  // run off the right edge nudge it to the upper-left.
  const cardWidth = 280
  const offsetX = window.innerWidth - anchor.x < cardWidth + 40 ? -cardWidth - 24 : 24
  const cardLeft = anchor.x + offsetX
  const cardTop = Math.max(14, anchor.y - 80)

  // Leader-line: SVG connecting the feature anchor to the card corner.
  // We render it as an absolutely-positioned svg covering the viewport.
  const leaderStart = { x: anchor.x, y: anchor.y }
  const leaderEnd = {
    x: offsetX > 0 ? cardLeft : cardLeft + cardWidth,
    y: cardTop + 16,
  }

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 11,
        }}
      >
        <line
          x1={leaderStart.x}
          y1={leaderStart.y}
          x2={leaderEnd.x}
          y2={leaderEnd.y}
          stroke="#2dd4bf"
          strokeWidth="1.5"
          strokeDasharray="2 4"
        />
        <circle cx={leaderStart.x} cy={leaderStart.y} r="6" fill="rgba(45,212,191,0.18)" />
        <circle cx={leaderStart.x} cy={leaderStart.y} r="3" fill="#2dd4bf" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cardLeft,
          top: cardTop,
          width: cardWidth,
          zIndex: 12,
          padding: 12,
          background: 'rgba(17,20,29,0.96)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          color: '#f0f2f8',
        }}
      >
        <PopupBody
          picked={picked}
          summaryFields={summaryFields}
          onClose={onClose}
          onOpenDrawer={onOpenDrawer}
        />
      </div>
    </>
  )
}

function PopupBody({
  picked,
  summaryFields,
  onClose,
  onOpenDrawer,
}: {
  picked: PickedFeature
  summaryFields: [string, unknown][]
  onClose: () => void
  onOpenDrawer: () => void
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {picked.name}
          </div>
          {picked.source && (
            <div
              style={{
                fontSize: 10,
                color: 'rgba(240,242,248,0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 2,
              }}
            >
              {picked.source}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            padding: 4,
            background: 'transparent',
            border: 'none',
            color: 'rgba(240,242,248,0.5)',
            cursor: 'pointer',
            lineHeight: 0,
          }}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {summaryFields.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 12,
            rowGap: 4,
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {summaryFields.map(([k, v]) => (
            <FieldPair key={k} label={k} value={v} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'rgba(240,242,248,0.5)', marginBottom: 10 }}>
          No attributes
        </div>
      )}

      <button
        onClick={onOpenDrawer}
        style={{
          width: '100%',
          padding: '7px 10px',
          background: 'rgba(36,83,255,0.18)',
          border: '1px solid rgba(36,83,255,0.4)',
          borderRadius: 6,
          color: '#9bb3ff',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Maximize2 size={12} /> View all attributes
      </button>
    </>
  )
}

function FieldPair({ label, value }: { label: string; value: unknown }) {
  const display = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (
    <>
      <span
        style={{
          color: 'rgba(240,242,248,0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 10,
          alignSelf: 'center',
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: '#f0f2f8',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={display}
      >
        {display}
      </span>
    </>
  )
}
