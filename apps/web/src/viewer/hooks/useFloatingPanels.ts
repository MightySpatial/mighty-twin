/** Single-active-utility-panel coordinator.
 *
 *  Several floating panels in the viewer (Table, Add Data) share
 *  the "utility" pool — only one is allowed to be open at a time.
 *  Opening one auto-closes whichever was active before, so the
 *  user is never juggling overlapping panels they didn't mean to
 *  stack.
 *
 *  MAI (the AI chat FAB), Fly, and Legend are NOT part of this
 *  pool — they have their own independent state. MAI/Fly are
 *  fixed-anchor surfaces; Legend is a sidebar fixture managed by
 *  `useLegendDock` and only renders as a floating panel when the
 *  user explicitly undocks it.
 *
 *  Zustand keeps the state global so any consumer (sidebar tab
 *  buttons, modal close hooks, programmatic deep-links) can call
 *  `openPanel('table')` or `togglePanel('add-data')` without
 *  threading callbacks through a parent.
 */

import { create } from 'zustand'

/** The utility panels managed by this slice. Keep the union narrow
 *  — pulling MAI / Fly / Legend in here would defeat the purpose
 *  of the exemption. */
export type FloatingPanelId = 'table' | 'add-data'

interface FloatingPanelsState {
  active: FloatingPanelId | null
  /** Set the active panel. Pass null to close all utility panels. */
  open: (id: FloatingPanelId | null) => void
  /** Toggle behaviour — opens the panel if not active, closes it
   *  if it already is. Mirrors the spec's "same button closes
   *  the panel" rule. */
  toggle: (id: FloatingPanelId) => void
  /** Convenience for `open(null)`. */
  closeAll: () => void
  /** Boolean predicate for consumers that need a memoised flag. */
  isOpen: (id: FloatingPanelId) => boolean
}

export const useFloatingPanels = create<FloatingPanelsState>((set, get) => ({
  active: null,
  open: (id) => set({ active: id }),
  toggle: (id) => set(state => ({ active: state.active === id ? null : id })),
  closeAll: () => set({ active: null }),
  isOpen: (id) => get().active === id,
}))
