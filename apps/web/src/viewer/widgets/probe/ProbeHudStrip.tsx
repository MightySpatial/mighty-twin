import type { HudRow } from './hudConfig'

interface Props {
  rows: HudRow[]
}

/** ProbeHudStrip — vertical strip on the right side of the viewer during
 *  probe. Each row shows: distance · feature label · key fields · severity.
 *
 *  Phase G v1: strip is rendered top-right. Future: tap a row to fly the
 *  camera to that feature (would exit probe).
 */
export function ProbeHudStrip({ rows }: Props) {
  if (rows.length === 0) return null

  // Group rows by layer for clearer reading
  const grouped = new Map<string, HudRow[]>()
  for (const r of rows) {
    const list = grouped.get(r.layerLabel) ?? []
    list.push(r)
    grouped.set(r.layerLabel, list)
  }

  return (
    <div
      aria-label="Probe near-analysis HUD"
      style={{
        position: 'absolute',
        top: 60,
        right: 14,
        width: 280,
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
        background: 'rgba(15, 17, 28, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: 10,
        padding: 10,
        zIndex: 42,
        backdropFilter: 'blur(12px)',
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: 12,
        scrollbarWidth: 'thin',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: '#818cf8', textTransform: 'uppercase',
        }}>NEAR · live</span>
        <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontFamily: '"SF Mono", monospace', fontSize: 10 }}>
          {rows.length} hit{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {[...grouped.entries()].map(([layerLabel, layerRows]) => (
        <div key={layerLabel} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255, 255, 255, 0.55)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
          }}>{layerLabel}</div>
          {layerRows.map((r) => (
            <div key={`${r.layerId}-${r.featureId}`} style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '6px 8px',
              borderRadius: 6,
              marginBottom: 4,
              background:
                r.severity === 'alert' ? 'rgba(248, 113, 113, 0.12)' :
                r.severity === 'warn' ? 'rgba(251, 191, 36, 0.10)' :
                'rgba(255, 255, 255, 0.03)',
              borderLeft: `2px solid ${
                r.severity === 'alert' ? '#f87171' :
                r.severity === 'warn' ? '#fbbf24' :
                '#818cf8'
              }`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500, color: '#fff' }}>{r.featureLabel}</span>
                <span style={{
                  fontFamily: '"SF Mono", monospace', fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.55)',
                }}>
                  {r.distanceM.toFixed(r.distanceM < 10 ? 1 : 0)} m
                </span>
              </div>
              {r.fields.length > 0 && (
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                  fontSize: 10, color: 'rgba(255, 255, 255, 0.55)',
                }}>
                  {r.fields.map((f, i) => (
                    <span key={i}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{f.label}:</span>{' '}
                      <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>{f.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
