import { createContext, useContext, type ReactNode } from 'react'
import type { ShellContextValue } from '../types'

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellContextProvider({
  value,
  children,
}: {
  value: ShellContextValue
  children: ReactNode
}) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

/** Access the shell context. Throws if used outside <AppShell>. */
export function useShellContext(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) {
    throw new Error(
      '@mightyspatial/app-shell: useShellContext() called outside <AppShell>. ' +
        'Ensure the component is rendered inside <AppShell>.',
    )
  }
  return ctx
}
