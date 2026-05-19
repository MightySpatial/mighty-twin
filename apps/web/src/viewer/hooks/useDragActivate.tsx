import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Drag-from-tile-to-map activation (the Google Street View pegman pattern).
 *
 *  Usage:
 *
 *    const drag = useDragActivate({
 *      glyph: <ProbeGlyph />,
 *      isValidDropTarget: (x, y) => sceneIsNavigable(viewer, x, y),
 *      onDrop: (x, y) => activateProbeAt(viewer, x, y),
 *    })
 *
 *    <button {...drag.tileProps}>Probe</button>
 *    {drag.glyphPortal}
 *
 *  The returned `tileProps` wire onPointerDown / onPointerUp on the tile
 *  button. The drag glyph is rendered as a fixed-position portal that
 *  follows the pointer. Tap fallback (pointerdown → pointerup without
 *  movement) enters "tap to place" mode — the next map tap activates.
 */

export interface UseDragActivateOptions {
  /** Glyph node — appears under the pointer during drag. Rendered as
   *  fixed-position so it can escape any overflow:hidden parent. */
  glyph: ReactNode
  /** Synchronous hit test — given a viewport (x, y) point in CSS pixels,
   *  return true if dropping here would activate. */
  isValidDropTarget: (clientX: number, clientY: number) => boolean
  /** Called on successful drop (or tap-then-tap fallback). */
  onDrop: (clientX: number, clientY: number) => void
  /** Called when the drag enters "tap to place" mode (user clicked tile
   *  without dragging). UI can show "Tap a feature to probe" hint. */
  onTapModeEnter?: () => void
  /** Called when tap mode exits without activating (esc or invalid tap). */
  onTapModeExit?: () => void
  /** Drag movement threshold in CSS pixels before considered a drag (not a
   *  tap). Default 6. */
  dragThreshold?: number
  /** Tap window in ms — within this, pointerdown→pointerup with no movement
   *  counts as a tap. Default 250. */
  tapWindowMs?: number
}

interface UseDragActivateReturn {
  /** Spread onto the tile button: onPointerDown handler, role, aria. */
  tileProps: {
    onPointerDown: (e: React.PointerEvent) => void
    role: 'button'
    tabIndex: 0
    'aria-grabbed': boolean
  }
  /** True while the user is actively dragging the glyph. */
  isDragging: boolean
  /** True while the user is in tap-to-place mode (post-tap, awaiting map tap). */
  isInTapMode: boolean
  /** The portal you must render somewhere in the tree (typically at the
   *  viewer root) so the glyph appears under the pointer. */
  glyphPortal: ReactNode
}

export function useDragActivate(opts: UseDragActivateOptions): UseDragActivateReturn {
  const {
    glyph,
    isValidDropTarget,
    onDrop,
    onTapModeEnter,
    onTapModeExit,
    dragThreshold = 6,
    tapWindowMs = 250,
  } = opts

  const [isDragging, setIsDragging] = useState(false)
  const [isInTapMode, setIsInTapMode] = useState(false)
  const [glyphPos, setGlyphPos] = useState<{ x: number; y: number } | null>(null)
  const [validDrop, setValidDrop] = useState(false)
  const downStateRef = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null)
  const movedRef = useRef(false)

  const tapModeBroadcastRef = useRef({ enter: onTapModeEnter, exit: onTapModeExit })
  tapModeBroadcastRef.current = { enter: onTapModeEnter, exit: onTapModeExit }

  const cleanup = useCallback(() => {
    setIsDragging(false)
    setGlyphPos(null)
    setValidDrop(false)
    movedRef.current = false
    downStateRef.current = null
  }, [])

  const handleTileDown = useCallback((e: React.PointerEvent) => {
    downStateRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      pointerId: e.pointerId,
    }
    movedRef.current = false
    setGlyphPos({ x: e.clientX, y: e.clientY })
    setValidDrop(false)
    // Don't setIsDragging yet — wait for movement threshold or tap-window
    // expiry to know if this is a drag or a tap.
  }, [])

  // Global pointer listeners while pointer is down or tap-mode active.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const down = downStateRef.current
      if (!down) return
      const dx = e.clientX - down.x
      const dy = e.clientY - down.y
      if (!movedRef.current && Math.hypot(dx, dy) >= dragThreshold) {
        movedRef.current = true
        setIsDragging(true)
        setIsInTapMode(false)
      }
      if (movedRef.current) {
        setGlyphPos({ x: e.clientX, y: e.clientY })
        setValidDrop(isValidDropTarget(e.clientX, e.clientY))
      }
    }
    function onUp(e: PointerEvent) {
      const down = downStateRef.current
      if (!down) return
      const elapsed = performance.now() - down.t
      const wasDrag = movedRef.current

      if (wasDrag) {
        const valid = isValidDropTarget(e.clientX, e.clientY)
        if (valid) {
          onDrop(e.clientX, e.clientY)
        }
        cleanup()
        if (isInTapMode) {
          setIsInTapMode(false)
          tapModeBroadcastRef.current.exit?.()
        }
      } else if (elapsed < tapWindowMs) {
        // Tap — enter tap-to-place mode (if not already in it)
        cleanup()
        setIsInTapMode((prev) => {
          const next = !prev
          if (next) tapModeBroadcastRef.current.enter?.()
          else tapModeBroadcastRef.current.exit?.()
          return next
        })
      } else {
        cleanup()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isDragging || downStateRef.current) {
          cleanup()
        }
        if (isInTapMode) {
          setIsInTapMode(false)
          tapModeBroadcastRef.current.exit?.()
        }
      }
    }

    // Tap-mode also routes the next click on the map to onDrop.
    function onTapModeClick(e: PointerEvent) {
      // Ignore clicks inside the tile button itself (handled by handleTileDown).
      const target = e.target as Element | null
      if (target?.closest('[data-drag-activate-tile]')) return
      const valid = isValidDropTarget(e.clientX, e.clientY)
      if (valid) {
        onDrop(e.clientX, e.clientY)
        setIsInTapMode(false)
        tapModeBroadcastRef.current.exit?.()
      }
      // Invalid tap in tap mode → stay in tap mode (don't disrupt the user)
    }

    if (downStateRef.current || isDragging) {
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
    }
    if (isInTapMode) {
      window.addEventListener('pointerdown', onTapModeClick)
      window.addEventListener('keydown', onKey)
    }
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointerdown', onTapModeClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [isDragging, isInTapMode, isValidDropTarget, onDrop, cleanup, dragThreshold, tapWindowMs])

  const glyphPortal = glyphPos
    ? (
        <div
          style={{
            position: 'fixed',
            left: glyphPos.x,
            top: glyphPos.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 100,
            opacity: isDragging ? (validDrop ? 1 : 0.5) : 0,
            filter: validDrop ? 'drop-shadow(0 0 12px rgba(129, 140, 248, 0.6))' : 'none',
            transition: 'opacity 80ms ease, filter 120ms ease',
          }}
          aria-hidden
        >
          {glyph}
        </div>
      )
    : null

  return {
    tileProps: {
      onPointerDown: handleTileDown,
      role: 'button',
      tabIndex: 0,
      'aria-grabbed': isDragging,
    },
    isDragging,
    isInTapMode,
    glyphPortal,
  }
}
