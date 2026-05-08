import { useEffect, useState } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { Math as CesiumMath } from 'cesium'
import styles from './CameraHUD.module.css'

interface CameraHUDProps {
  /** The live Cesium viewer. Passed by the host app — keeps admin-panels
   *  independent of CesiumProvider / cesium-core context. */
  viewer: CesiumViewer | null
}

interface Snapshot {
  longitude: number
  latitude: number
  height: number
  heading: number
  pitch: number
  roll: number
}

/** Live camera readout. Subscribes to the viewer's moveEnd event. */
export function CameraHUD({ viewer }: CameraHUDProps) {
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    if (!viewer) {
      setSnap(null)
      return
    }
    const capture = () => {
      const c = viewer.camera
      const carto = c.positionCartographic
      setSnap({
        longitude: CesiumMath.toDegrees(carto.longitude),
        latitude: CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
        heading: CesiumMath.toDegrees(c.heading),
        pitch: CesiumMath.toDegrees(c.pitch),
        roll: CesiumMath.toDegrees(c.roll),
      })
    }
    capture()
    const remove = viewer.camera.moveEnd.addEventListener(capture)
    return () => {
      remove()
    }
  }, [viewer])

  if (!viewer) {
    return <div className={styles.empty}>Viewer not mounted yet.</div>
  }
  if (!snap) {
    return <div className={styles.empty}>Waiting for camera state…</div>
  }

  return (
    <div className={styles.hud}>
      <span className={styles.label}>Longitude</span>
      <span className={styles.value}>{snap.longitude.toFixed(5)}°</span>
      <span className={styles.label}>Latitude</span>
      <span className={styles.value}>{snap.latitude.toFixed(5)}°</span>
      <span className={styles.label}>Height</span>
      <span className={styles.value}>{formatHeight(snap.height)}</span>
      <span className={styles.label}>Heading</span>
      <span className={styles.value}>{snap.heading.toFixed(1)}°</span>
      <span className={styles.label}>Pitch</span>
      <span className={styles.value}>{snap.pitch.toFixed(1)}°</span>
      <span className={styles.label}>Roll</span>
      <span className={styles.value}>{snap.roll.toFixed(1)}°</span>
    </div>
  )
}

function formatHeight(m: number): string {
  if (Math.abs(m) >= 1_000_000) return `${(m / 1_000_000).toFixed(2)} Mm`
  if (Math.abs(m) >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${m.toFixed(1)} m`
}
