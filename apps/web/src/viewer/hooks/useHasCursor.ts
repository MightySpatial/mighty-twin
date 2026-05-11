import { useEffect, useState } from 'react'

/** Detects a precise pointer (mouse/trackpad) + hover capability — the
 *  combination web platforms expose for "desktop-style" input. Phones and
 *  most tablets report `(pointer: coarse)` / `(hover: none)`; a tablet with
 *  a Magic Keyboard / attached trackpad flips to fine+hover, which is what
 *  we want for input-gated features like the Fly widget (WASD/arrows/Q/E).
 *
 *  Returns `false` during SSR and on the first client paint until the media
 *  query has been read, so callers can default to the safer "no cursor"
 *  branch.
 */
export function useHasCursor(): boolean {
  const [hasCursor, setHasCursor] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: fine) and (hover: hover)')
    const update = () => setHasCursor(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  return hasCursor
}
