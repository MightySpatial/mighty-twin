import { useEffect, useRef, useState, type RefObject } from 'react'

/** Observes the size of a DOM element. Returns a ref to attach to the element
 *  and the current size. Handy for firing viewer.resize() when the viewer
 *  surface pane changes size. */
export function useResizeObserver<T extends HTMLElement>(): {
  ref: RefObject<T>
  size: { width: number; height: number }
} {
  const ref = useRef<T>(null) as RefObject<T>
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })
    observer.observe(el)
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}
