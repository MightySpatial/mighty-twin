/** Legend dock state.
 *
 *  The Legend is a persistent fixture rather than a transient utility
 *  popup. By default it lives docked at the bottom of the left
 *  sidebar's content panel. Two flags govern its behaviour:
 *
 *    - docked     — true ⇒ Legend renders inline inside the sidebar.
 *                   false ⇒ Legend renders as a floating draggable
 *                   panel anchored over the canvas (the old behaviour).
 *    - collapsed  — when docked, controls whether the legend body is
 *                   expanded or condensed to a single "LEGEND ▸" row.
 *                   When undocked, controls whether the floating
 *                   panel is shown at all (the sidebar tab toggles
 *                   this so the legend can be summoned without
 *                   re-docking).
 *
 *  Both bits persist to localStorage so the user's last layout
 *  survives reloads — a docked-and-collapsed legend is genuinely the
 *  preferred resting state for many users and rebooting back to
 *  expanded would be noise.
 *
 *  Legend deliberately sits OUTSIDE the useFloatingPanels pool. The
 *  utility-panel manager only coordinates panels that compete for the
 *  same "single active floating popup" slot (Table, Add Data) — the
 *  Legend is not transient.
 */

import { create } from 'zustand'

const DOCKED_KEY = 'mighty:legend:docked'
const COLLAPSED_KEY = 'mighty:legend:collapsed'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === '1'
  } catch {
    return fallback
  }
}
function writeBool(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* unavailable */ }
}

interface LegendDockState {
  docked: boolean
  collapsed: boolean
  /** Send the legend back to the sidebar (and expand it so the user
   *  sees the content land somewhere visible). */
  dock: () => void
  /** Pop the legend out as a free-floating draggable panel. */
  undock: () => void
  /** Sidebar tab + chevron toggle the collapsed/expanded state when
   *  docked; when undocked it acts as a show/hide for the floating
   *  panel. The two semantics share a flag because the user-facing
   *  control is the same button. */
  toggleCollapsed: () => void
  setCollapsed: (collapsed: boolean) => void
}

export const useLegendDock = create<LegendDockState>((set) => ({
  docked: readBool(DOCKED_KEY, true),
  collapsed: readBool(COLLAPSED_KEY, false),
  dock: () => set(() => {
    writeBool(DOCKED_KEY, true)
    writeBool(COLLAPSED_KEY, false)
    return { docked: true, collapsed: false }
  }),
  undock: () => set(() => {
    writeBool(DOCKED_KEY, false)
    writeBool(COLLAPSED_KEY, false)
    return { docked: false, collapsed: false }
  }),
  toggleCollapsed: () => set(state => {
    const next = !state.collapsed
    writeBool(COLLAPSED_KEY, next)
    return { collapsed: next }
  }),
  setCollapsed: (collapsed) => set(() => {
    writeBool(COLLAPSED_KEY, collapsed)
    return { collapsed }
  }),
}))
