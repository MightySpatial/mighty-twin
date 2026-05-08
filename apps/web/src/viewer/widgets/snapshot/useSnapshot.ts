/** useSnapshot — capture viewer state + thumbnail, save via /me/snapshots.
 *
 *  A snapshot is a frozen view of the site: camera position, layer
 *  visibility, and a compressed thumbnail so the gallery has something
 *  to render. Backend stores the bag of state in payload + a per-user
 *  S3-style blob; we keep the thumbnail inline (≤ 200 KB after JPEG
 *  compression at 0.7).
 */

import { useCallback, useState } from 'react'
import { Cartesian3, Math as CesiumMath, type Viewer } from 'cesium'

interface SnapshotPayload {
  camera: {
    longitude: number
    latitude: number
    height: number
    heading: number
    pitch: number
    roll: number
  }
  layers: { id: string; visible: boolean; opacity: number }[]
  thumbnail_url: string | null
  captured_at: string
}

export interface SaveSnapshotInput {
  name: string
  description: string | null
  shareToGallery: boolean
}

export function useSnapshot(viewerRef: React.MutableRefObject<Viewer | null>) {
  const [busy, setBusy] = useState(false)

  const capturePayload = useCallback(
    (visibleLayers: { id: string; visible: boolean; opacity: number }[] = []): SnapshotPayload => {
      const viewer = viewerRef.current
      const cam = viewer?.camera
      const cart = cam?.positionCartographic
      let thumbnail_url: string | null = null
      if (viewer) {
        try {
          // Force a render so the canvas is fresh.
          viewer.scene.render()
          const canvas = viewer.scene.canvas
          // Smaller canvas for the thumbnail. 480x320 = 4:3 aspect,
          // small enough to keep base64 under ~150KB at q=0.7.
          const thumb = document.createElement('canvas')
          thumb.width = 480
          thumb.height = 320
          const ctx = thumb.getContext('2d')
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height)
            thumbnail_url = thumb.toDataURL('image/jpeg', 0.7)
          }
        } catch {
          /* webGL surface lost mid-capture */
        }
      }
      return {
        camera: {
          longitude: cart ? CesiumMath.toDegrees(cart.longitude) : 0,
          latitude: cart ? CesiumMath.toDegrees(cart.latitude) : 0,
          height: cart ? cart.height : 0,
          heading: cam ? CesiumMath.toDegrees(cam.heading) : 0,
          pitch: cam ? CesiumMath.toDegrees(cam.pitch) : 0,
          roll: cam ? CesiumMath.toDegrees(cam.roll) : 0,
        },
        layers: visibleLayers,
        thumbnail_url,
        captured_at: new Date().toISOString(),
      }
    },
    [viewerRef],
  )

  const restoreCamera = useCallback(
    (payload: SnapshotPayload, durationSecs = 1.4) => {
      const viewer = viewerRef.current
      if (!viewer || !payload?.camera) return
      const c = payload.camera
      try {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(c.longitude, c.latitude, c.height),
          orientation: {
            heading: CesiumMath.toRadians(c.heading || 0),
            pitch: CesiumMath.toRadians(c.pitch || -45),
            roll: CesiumMath.toRadians(c.roll || 0),
          },
          duration: durationSecs,
        })
      } catch {
        /* viewer destroyed */
      }
    },
    [viewerRef],
  )

  return { busy, setBusy, capturePayload, restoreCamera }
}

export type { SnapshotPayload }
