/**
 * useVoxelToolParams — per-tool parameter scratchpad.
 *
 * The voxel tools don't have draft DAG nodes (unlike the CAD tools);
 * their parameters are short-lived form state that only matters until
 * the user clicks "Apply" / "Stamp". Holding the form values in a
 * zustand store rather than React local state means the toolbox can
 * tear down + re-mount the parameters component (e.g. when switching
 * tools) without losing what the user had typed.
 *
 * Keys are tool ids; values are loose `Record<string, unknown>` bags.
 * Each Parameters component reads its own slice via `useToolParams`.
 */
import { create } from 'zustand'

interface ParamsStore {
  params: Record<string, Record<string, unknown>>
  setParam: (toolId: string, key: string, value: unknown) => void
  setParams: (toolId: string, patch: Record<string, unknown>) => void
  getParams: (toolId: string) => Record<string, unknown>
  clear: (toolId: string) => void
}

export const useVoxelToolParams = create<ParamsStore>((set, get) => ({
  params: {},
  setParam: (toolId, key, value) => {
    set(state => ({
      params: {
        ...state.params,
        [toolId]: { ...(state.params[toolId] ?? {}), [key]: value },
      },
    }))
  },
  setParams: (toolId, patch) => {
    set(state => ({
      params: {
        ...state.params,
        [toolId]: { ...(state.params[toolId] ?? {}), ...patch },
      },
    }))
  },
  getParams: (toolId) => get().params[toolId] ?? {},
  clear: (toolId) => {
    set(state => {
      const { [toolId]: _, ...rest } = state.params
      return { params: rest }
    })
  },
}))

/** Hook that returns a tool's current params + a setter bound to the
 *  same tool id. Components use it like:
 *    const { params, setParam } = useToolParams('voxel_box')
 *    <input value={num(params.width, 1)} onChange={e => setParam('width', +e.target.value)} /> */
export function useToolParams(toolId: string) {
  const params = useVoxelToolParams(s => s.params[toolId] ?? EMPTY)
  const setParam = useVoxelToolParams(s => s.setParam)
  const setParams = useVoxelToolParams(s => s.setParams)
  return {
    params,
    setParam: (key: string, value: unknown) => setParam(toolId, key, value),
    setParams: (patch: Record<string, unknown>) => setParams(toolId, patch),
  }
}

const EMPTY: Record<string, unknown> = {}

export function num(p: Record<string, unknown>, key: string, fallback: number): number {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
export function str(p: Record<string, unknown>, key: string, fallback: string): string {
  const v = p[key]
  return typeof v === 'string' ? v : fallback
}
export function bool(p: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = p[key]
  return typeof v === 'boolean' ? v : fallback
}
