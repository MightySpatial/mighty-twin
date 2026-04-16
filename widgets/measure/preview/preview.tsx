import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { CesiumProvider } from '@mightyspatial/cesium-core'
import { MeasureWidget } from '../src/MeasureWidget'
import type { WidgetContext } from '@mightyspatial/widget-host'
import { previewSite } from './fixtures'

/**
 * Interactive preview rendered inside the ux-guide app's "Live" tab.
 *
 * Boots a standalone Cesium viewer over the preview site, mounts the Measure
 * widget, and wires a minimal WidgetContext so the widget has everything it
 * needs to run outside an app shell.
 */
export function MeasurePreview() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const v = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
    })

    if (previewSite.defaultCamera) {
      const { longitude, latitude, height, heading = 0, pitch = -45 } =
        previewSite.defaultCamera
      v.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: Cesium.Math.toRadians(pitch),
          roll: 0,
        },
      })
    }

    setViewer(v)
    return () => {
      v.destroy()
      setViewer(null)
    }
  }, [])

  const ctx: WidgetContext | null = viewer
    ? {
        viewer,
        user: null,
        site: previewSite,
        config: {},
        api: {
          get: async () => ({}),
          post: async () => ({}),
          put: async () => ({}),
          del: async () => ({}),
        },
        toast: (opts) => console.log(`[toast:${opts.level ?? 'info'}] ${opts.message}`),
      }
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '520px' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
        {ctx && (
          <CesiumProvider getViewer={() => viewer}>
            <MeasureWidget ctx={ctx} onClose={() => {}} />
          </CesiumProvider>
        )}
      </div>
    </div>
  )
}

export default MeasurePreview
