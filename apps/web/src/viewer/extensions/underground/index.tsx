/**
 * MightyTwin — Underground Extension
 * Adds globe transparency slider + underground false floor plane.
 * Install by importing this file in extensions/index.ts.
 */
import { useState, useEffect, useRef } from 'react'
import {
  Viewer as CesiumViewer,
  Color,
  Entity,
  Rectangle,
} from 'cesium'
import { registerExtension, PanelProps } from '../types'

// ─── False floor config ───────────────────────────────────────────────────────

const FALSE_FLOOR_DEPTH_M = -150  // metres below WGS84 surface

function createFalseFloor(viewer: CesiumViewer): Entity {
  // Large rectangle at fixed depth — covers the whole globe
  return viewer.entities.add({
    name: '__underground_floor__',
    rectangle: {
      coordinates: new Rectangle(-Math.PI, -Math.PI / 2, Math.PI, Math.PI / 2),
      height: FALSE_FLOOR_DEPTH_M,
      material: Color.fromCssColorString('#0a0a14').withAlpha(0.92),
      outline: false,
    },
  })
}

// ─── Panel UI ─────────────────────────────────────────────────────────────────

function UndergroundPanel({ viewer, context, onClose }: PanelProps) {
  const [transparency, setTransparency] = useState(0)
  const [floorEnabled, setFloorEnabled] = useState(false)
  const floorEntityRef = useRef<Entity | null>(null)

  // Restore saved state
  useEffect(() => {
    const saved = context.getSiteConfig('underground') as { transparency?: number; floor?: boolean } | undefined
    if (saved) {
      if (typeof saved.transparency === 'number') {
        setTransparency(saved.transparency)
        applyTransparency(viewer, saved.transparency)
      }
      if (saved.floor) {
        setFloorEnabled(true)
        floorEntityRef.current = createFalseFloor(viewer)
      }
    }
    return () => {
      // Clean up on panel close
      applyTransparency(viewer, 0)
      if (floorEntityRef.current) {
        viewer.entities.remove(floorEntityRef.current)
        floorEntityRef.current = null
      }
    }
  }, [])

  const handleTransparency = (val: number) => {
    setTransparency(val)
    applyTransparency(viewer, val)
    context.setSiteConfig('underground', { transparency: val, floor: floorEnabled })
  }

  const handleFloor = (enabled: boolean) => {
    setFloorEnabled(enabled)
    if (enabled) {
      if (!floorEntityRef.current) {
        floorEntityRef.current = createFalseFloor(viewer)
      }
    } else {
      if (floorEntityRef.current) {
        viewer.entities.remove(floorEntityRef.current)
        floorEntityRef.current = null
      }
    }
    context.setSiteConfig('underground', { transparency, floor: enabled })
  }

  return (
    <div className="ext-panel">
      <div className="ext-panel-header">
        <span>Underground</span>
        <button className="ext-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="ext-panel-body">
        <div className="ext-field">
          <label className="ext-label">Globe Transparency</label>
          <div className="ext-slider-row">
            <input
              type="range"
              min={0}
              max={100}
              value={transparency}
              onChange={e => handleTransparency(Number(e.target.value))}
              className="ext-slider"
            />
            <span className="ext-slider-val">{transparency}%</span>
          </div>
          <p className="ext-hint">Make the terrain transparent to see underground layers.</p>
        </div>

        <div className="ext-field">
          <label className="ext-toggle-row">
            <input
              type="checkbox"
              checked={floorEnabled}
              onChange={e => handleFloor(e.target.checked)}
            />
            <span className="ext-label">Underground floor</span>
          </label>
          <p className="ext-hint">Show a dark plane at {Math.abs(FALSE_FLOOR_DEPTH_M)}m depth as a visual reference.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Globe transparency helper ────────────────────────────────────────────────

function applyTransparency(viewer: CesiumViewer, pct: number) {
  const alpha = 1 - pct / 100
  if (pct === 0) {
    viewer.scene.globe.translucency.enabled = false
    viewer.scene.globe.translucency.frontFaceAlpha = 1.0
  } else {
    viewer.scene.globe.translucency.enabled = true
    viewer.scene.globe.translucency.frontFaceAlpha = alpha
    viewer.scene.globe.translucency.backFaceAlpha = alpha * 0.5
    viewer.scene.globe.undergroundColor = Color.fromCssColorString('#0a0a14')
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

registerExtension({
  id: 'underground',
  name: 'Underground',
  version: '1.0.0',

  panel: {
    icon: <span style={{ fontSize: 16 }}>⬇️</span>,
    label: 'Underground',
    component: UndergroundPanel,
  },

  onUnload: (viewer) => {
    applyTransparency(viewer, 0)
  },
})
