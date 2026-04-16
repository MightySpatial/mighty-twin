/**
 * MightyTwin — Tetra View
 * Composite 5-camera viewport modelling a truncated rectangular pyramid (frustum).
 * The user sits at the apex; the display plane is the large bottom face (full screen).
 * The centre rectangle is the projected top face; the 4 trapezoids are the walls.
 * All 5 panels are full-screen divs clipped by matching polygons → zero-gap tiling.
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import {
  Viewer as CesiumViewer,
  CesiumWidget,
  Cartesian3,
  Math as CesiumMath,
  Terrain,
} from 'cesium'
import { X, Grid3X3, Maximize } from 'lucide-react'
import './TetraView.css'

/* ── Geometry ─────────────────────────────────────────────────────────────── */

type WallAngle = 30 | 45 | 60

const WALL_ANGLES: Record<WallAngle, { hInset: number; vInset: number }> = {
  30: { hInset: 20, vInset: 20 },
  45: { hInset: 30, vInset: 30 },
  60: { hInset: 38, vInset: 38 },
}

function computeClipPaths(hI: number, vI: number) {
  const h2 = 100 - hI
  const v2 = 100 - vI
  return {
    centre: `polygon(${hI}% ${vI}%, ${h2}% ${vI}%, ${h2}% ${v2}%, ${hI}% ${v2}%)`,
    top:    `polygon(0% 0%, 100% 0%, ${h2}% ${vI}%, ${hI}% ${vI}%)`,
    bottom: `polygon(${hI}% ${v2}%, ${h2}% ${v2}%, 100% 100%, 0% 100%)`,
    left:   `polygon(0% 0%, ${hI}% ${vI}%, ${hI}% ${v2}%, 0% 100%)`,
    right:  `polygon(${h2}% ${vI}%, 100% 0%, 100% 100%, ${h2}% ${v2}%)`,
  }
}

/* ── Panel definitions ────────────────────────────────────────────────────── */

type PanelId = 'left' | 'right' | 'top' | 'bottom'

interface PanelDef {
  id: PanelId
  label: string
  headingSign: number   // multiplied by wallAngle
  pitchSign: number     // multiplied by wallAngle
  clipKey: PanelId
}

const PANELS: PanelDef[] = [
  { id: 'left',   label: 'Left',   headingSign: -1, pitchSign:  0, clipKey: 'left' },
  { id: 'right',  label: 'Right',  headingSign:  1, pitchSign:  0, clipKey: 'right' },
  { id: 'top',    label: 'Top',    headingSign:  0, pitchSign:  1, clipKey: 'top' },
  { id: 'bottom', label: 'Bottom', headingSign:  0, pitchSign: -1, clipKey: 'bottom' },
]

/* ── Component ────────────────────────────────────────────────────────────── */

type BorderMode = 'seamless' | 'bordered'

interface TetraViewProps {
  viewer: CesiumViewer
  onClose: () => void
}

export default function TetraView({ viewer, onClose }: TetraViewProps) {
  const centreRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const widgetRefs = useRef<Record<string, CesiumWidget>>({})
  const removeListenerRef = useRef<(() => void) | null>(null)
  const [borderMode, setBorderMode] = useState<BorderMode>('seamless')
  const [wallAngle, setWallAngle] = useState<WallAngle>(45)

  const { hInset, vInset } = WALL_ANGLES[wallAngle]
  const clips = useMemo(() => computeClipPaths(hInset, vInset), [hInset, vInset])

  const borderShadow = borderMode === 'bordered' ? 'inset 0 0 0 2px #0a0a0f' : undefined

  const setPanelRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    panelRefs.current[id] = el
  }, [])

  // Sync peripheral cameras to match centre camera with offsets
  const syncCameras = useCallback(() => {
    const cam = viewer.camera
    const pos = cam.positionCartographic

    for (const panel of PANELS) {
      const widget = widgetRefs.current[panel.id]
      if (!widget || widget.isDestroyed()) continue

      try {
        const destCart = Cartesian3.fromRadians(pos.longitude, pos.latitude, pos.height)
        widget.camera.setView({
          destination: destCart,
          orientation: {
            heading: cam.heading + CesiumMath.toRadians(panel.headingSign * wallAngle),
            pitch: cam.pitch + CesiumMath.toRadians(panel.pitchSign * wallAngle),
            roll: cam.roll,
          },
        })
      } catch {
        // Widget may have been destroyed between check and use
      }
    }
  }, [viewer, wallAngle])

  // Mount the centre viewer canvas into our centre panel
  useEffect(() => {
    const container = centreRef.current
    if (!container) return

    const cesiumContainer = viewer.container as HTMLElement
    const originalParent = cesiumContainer.parentElement
    const originalStyle = cesiumContainer.style.cssText

    // Move the main viewer's DOM into our centre panel
    container.appendChild(cesiumContainer)
    cesiumContainer.style.cssText = 'width:100%;height:100%;position:relative;'
    viewer.resize()

    return () => {
      // Restore the viewer to its original parent
      if (originalParent && !viewer.isDestroyed()) {
        originalParent.appendChild(cesiumContainer)
        cesiumContainer.style.cssText = originalStyle
        viewer.resize()
      }
    }
  }, [viewer])

  // Mount peripheral CesiumWidgets
  useEffect(() => {
    const widgets: CesiumWidget[] = []

    for (const panel of PANELS) {
      const el = panelRefs.current[panel.id]
      if (!el) continue

      try {
        const widget = new CesiumWidget(el, {
          terrain: Terrain.fromWorldTerrain(),
          creditContainer: document.createElement('div'),
        })
        widget.scene.globe.enableLighting = false
        if (widget.scene.skyAtmosphere) widget.scene.skyAtmosphere.show = true

        // Disable user interaction on peripheral panels
        widget.scene.screenSpaceCameraController.enableRotate = false
        widget.scene.screenSpaceCameraController.enableTranslate = false
        widget.scene.screenSpaceCameraController.enableZoom = false
        widget.scene.screenSpaceCameraController.enableTilt = false
        widget.scene.screenSpaceCameraController.enableLook = false

        widgetRefs.current[panel.id] = widget
        widgets.push(widget)
      } catch (err) {
        console.warn(`[TetraView] Failed to init ${panel.id} panel:`, err)
        if (el.parentElement) el.parentElement.style.display = 'none'
      }
    }

    // Initial sync
    syncCameras()

    // Listen for camera changes on the centre viewer
    const removeChanged = viewer.camera.changed.addEventListener(syncCameras)
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(syncCameras)
    removeListenerRef.current = () => {
      removeChanged()
      removeMoveEnd()
    }

    return () => {
      removeListenerRef.current?.()
      removeListenerRef.current = null
      for (const w of widgets) {
        if (!w.isDestroyed()) {
          try { w.destroy() } catch { /* noop */ }
        }
      }
      widgetRefs.current = {}
    }
  }, [viewer, syncCameras])

  // Also sync on every render tick for smooth tracking
  useEffect(() => {
    const removePreRender = viewer.scene.preRender.addEventListener(syncCameras)
    return () => removePreRender()
  }, [viewer, syncCameras])

  return (
    <div className="tetra-overlay">
      {/* Centre — main viewer gets reparented here */}
      <div
        className="tetra-panel"
        ref={centreRef}
        style={{ clipPath: clips.centre, zIndex: 2, boxShadow: borderShadow }}
      >
        <span className="tetra-label">Centre</span>
      </div>

      {/* Peripheral panels */}
      {PANELS.map((p) => (
        <div
          key={p.id}
          className="tetra-panel"
          style={{ clipPath: clips[p.clipKey], zIndex: 1, boxShadow: borderShadow }}
        >
          <div
            ref={setPanelRef(p.id)}
            style={{ width: '100%', height: '100%' }}
          />
          <span className="tetra-label">{p.label}</span>
        </div>
      ))}

      {/* Wall angle toggle — top centre */}
      <div className="tetra-angle-toggle">
        {([30, 45, 60] as WallAngle[]).map((a) => (
          <button
            key={a}
            className={`tetra-angle-btn${wallAngle === a ? ' tetra-angle-btn--active' : ''}`}
            onClick={() => setWallAngle(a)}
          >
            {a}°
          </button>
        ))}
      </div>

      {/* Border mode toggle — top left */}
      <button
        className="tetra-mode-toggle"
        onClick={() => setBorderMode(m => m === 'seamless' ? 'bordered' : 'seamless')}
        title={borderMode === 'seamless' ? 'Switch to bordered' : 'Switch to seamless'}
      >
        {borderMode === 'seamless' ? <Grid3X3 size={16} /> : <Maximize size={16} />}
        <span className="tetra-mode-label">{borderMode === 'seamless' ? 'Seamless' : 'Bordered'}</span>
      </button>

      {/* Close button — top right */}
      <button className="tetra-close" onClick={onClose} title="Exit Tetra View">
        <X size={18} />
      </button>
    </div>
  )
}
