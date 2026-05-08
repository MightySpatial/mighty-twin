/** MaiContext — lets the viewer shell signal to DraggableMai that a
 *  widget panel is open, triggering the docked bottom-bar mode. */

import { createContext, useContext, useState, type ReactNode } from 'react'

interface MaiContextValue {
  /** True when a sidebar widget or design panel is open in the viewer. */
  docked: boolean
  setDocked: (v: boolean) => void
}

const MaiCtx = createContext<MaiContextValue>({ docked: false, setDocked: () => {} })

export function MaiProvider({ children }: { children: ReactNode }) {
  const [docked, setDocked] = useState(false)
  return <MaiCtx.Provider value={{ docked, setDocked }}>{children}</MaiCtx.Provider>
}

export function useMaiDock() {
  return useContext(MaiCtx)
}
