import { useEffect, useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'

interface ViewerStateJsonProps {
  viewer: CesiumViewer | null
}

/** Live JSON readout of key viewer state. For debugging only. Updates on a
 *  low-frequency tick so we don't thrash the DOM every frame. */
export function ViewerStateJson({ viewer }: ViewerStateJsonProps) {
  const [state, setState] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!viewer) return
    const tick = () => setState(extract(viewer))
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [viewer])

  if (!viewer) {
    return (
      <pre
        style={{
          padding: 16,
          margin: 0,
          borderRadius: 10,
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 12,
        }}
      >
        Viewer not mounted yet.
      </pre>
    )
  }

  return (
    <pre
      style={{
        padding: 16,
        margin: 0,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#cfd3dc',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        lineHeight: 1.5,
        overflow: 'auto',
        maxHeight: 360,
      }}
    >
      {JSON.stringify(state, null, 2)}
    </pre>
  )
}

function extract(v: CesiumViewer): Record<string, unknown> {
  const globe = v.scene.globe
  const imagery = v.imageryLayers
  return {
    imageryLayerCount: imagery.length,
    globe: {
      show: globe.show,
      depthTestAgainstTerrain: globe.depthTestAgainstTerrain,
      enableLighting: globe.enableLighting,
      tilesLoaded: globe.tilesLoaded,
    },
    terrain: {
      provider: v.terrainProvider?.constructor?.name,
    },
    canvas: {
      width: v.canvas.width,
      height: v.canvas.height,
    },
    scene: {
      mode: String(v.scene.mode),
      requestRenderMode: v.scene.requestRenderMode,
    },
  }
}
