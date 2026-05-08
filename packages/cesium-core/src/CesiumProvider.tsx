import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { Viewer as CesiumViewer } from 'cesium'

interface CesiumContextValue {
  viewer: CesiumViewer | null
  viewerRef: RefObject<CesiumViewer | null>
  ready: boolean
}

const CesiumContext = createContext<CesiumContextValue | null>(null)

interface CesiumProviderProps {
  children: ReactNode
  /**
   * Called when the host is ready to construct a viewer. Return the viewer
   * instance. The host is responsible for lifecycle (container mount, destroy).
   */
  getViewer: () => CesiumViewer | null
}

/**
 * Owns the Cesium viewer ref and exposes it to descendants.
 *
 * Host apps construct the viewer once (e.g. mounting `new Cesium.Viewer(el)`
 * in a useEffect) and pass `getViewer` so this provider can track when it
 * becomes available.
 */
export function CesiumProvider({ children, getViewer }: CesiumProviderProps) {
  const viewerRef = useRef<CesiumViewer | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Poll once per animation frame until the host returns a viewer, then stop.
    let frameHandle = 0
    const check = () => {
      const v = getViewer()
      if (v) {
        viewerRef.current = v
        setReady(true)
        return
      }
      frameHandle = requestAnimationFrame(check)
    }
    check()
    return () => {
      if (frameHandle) cancelAnimationFrame(frameHandle)
      viewerRef.current = null
      setReady(false)
    }
  }, [getViewer])

  const value = useMemo<CesiumContextValue>(
    () => ({
      viewer: viewerRef.current,
      viewerRef,
      ready,
    }),
    [ready],
  )

  return <CesiumContext.Provider value={value}>{children}</CesiumContext.Provider>
}

function useContextOrThrow(): CesiumContextValue {
  const ctx = useContext(CesiumContext)
  if (!ctx) {
    throw new Error(
      '@mightyspatial/cesium-core: hook used outside <CesiumProvider>. ' +
        'Wrap your widget tree with a CesiumProvider and pass a getViewer function.',
    )
  }
  return ctx
}

/** Returns the Cesium viewer, or null if not yet ready. */
export function useViewer(): CesiumViewer | null {
  return useContextOrThrow().viewer
}

/**
 * Returns a stable ref to the Cesium viewer. Prefer this for long-lived
 * callbacks where re-creating the callback per-render would churn listeners.
 */
export function useViewerRef(): RefObject<CesiumViewer | null> {
  return useContextOrThrow().viewerRef
}

/** `true` once the viewer has been constructed and attached. */
export function useViewerReady(): boolean {
  return useContextOrThrow().ready
}
