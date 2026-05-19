import { useEffect, useRef, useState, useCallback } from 'react'
import type { Viewer as CesiumViewer } from 'cesium'
import { Cartesian3, Math as CesiumMathLib } from 'cesium'
import { loadGoogleMaps } from './loader'
import { useToast } from '../../hooks/useToast'
import { useBreakpoint } from '@mightyspatial/app-shell'
import { X } from 'lucide-react'
import styles from './StreetViewPanel.module.css'

/// <reference types="@types/google.maps" />

interface Props {
  /** API key from settings.google.mapsApiKey. */
  apiKey: string
  /** Search radius (m) for getPanorama. */
  searchRadiusM: number
  /** Drop point — lat/lon to start the panorama at. */
  dropPoint: { lat: number; lon: number } | null
  /** Cesium viewer — we mirror the panorama position back to Cesium so the map
   *  shows where you are. */
  viewer: CesiumViewer | null
  /** Close handler — caller flips its open state. */
  onClose: () => void
}

/** Google Street View panel — split-pane on tablet/desktop (panorama left,
 *  Cesium right), stacked on phone (panorama top, Cesium bottom-third).
 *
 *  WASD step-nav: W = forward (closest forward-facing link), S = backward,
 *  A/D = look yaw, arrows = pitch. ESC closes.
 *
 *  Cesium camera is mirrored to the panorama position (with a yellow
 *  "you-are-here" marker on the map side).
 */
export function StreetViewPanel({ apiKey, searchRadiusM, dropPoint, viewer, onClose }: Props) {
  const panoContainerRef = useRef<HTMLDivElement | null>(null)
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lon: number; heading: number } | null>(null)
  const { addToast } = useToast()
  const breakpoint = useBreakpoint()

  /** Mount the panorama on first dropPoint. */
  useEffect(() => {
    if (!dropPoint || !panoContainerRef.current) return

    let cancelled = false
    setLoading(true)
    setErrorReason(null)

    loadGoogleMaps(apiKey)
      .then(async (maps) => {
        if (cancelled || !panoContainerRef.current) return
        // First check imagery exists
        const service = new maps.StreetViewService()
        let panoData: google.maps.StreetViewPanoramaData | null = null
        try {
          const result = await service.getPanorama({
            location: { lat: dropPoint.lat, lng: dropPoint.lon },
            radius: searchRadiusM,
            source: maps.StreetViewSource.OUTDOOR,
          })
          panoData = result.data
        } catch {
          if (!cancelled) {
            setErrorReason('no-imagery')
            setLoading(false)
            addToast('warning', `No Street View imagery within ${searchRadiusM} m of that point.`)
          }
          return
        }
        if (cancelled || !panoData?.location) return

        // Mount the panorama
        const pano = new maps.StreetViewPanorama(panoContainerRef.current, {
          pano: panoData.location.pano,
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          addressControl: false,
          panControl: false,
          zoomControl: true,
          fullscreenControl: false,
          showRoadLabels: false,
          motionTracking: false,
          motionTrackingControl: false,
          enableCloseButton: false,
        })
        panoramaRef.current = pano
        setLoading(false)

        // Listen for position + POV changes and mirror to Cesium camera.
        pano.addListener('position_changed', () => {
          const loc = pano.getPosition()
          const pov = pano.getPov()
          if (!loc) return
          const lat = loc.lat()
          const lng = loc.lng()
          const heading = pov.heading ?? 0
          setPosition({ lat, lon: lng, heading })
          mirrorToCesium(viewer, lat, lng, heading)
        })
        pano.addListener('pov_changed', () => {
          const loc = pano.getPosition()
          const pov = pano.getPov()
          if (!loc) return
          const lat = loc.lat()
          const lng = loc.lng()
          const heading = pov.heading ?? 0
          setPosition({ lat, lon: lng, heading })
          mirrorToCesium(viewer, lat, lng, heading)
        })

        // Mirror the initial position
        const lat = panoData.location.latLng?.lat() ?? dropPoint.lat
        const lng = panoData.location.latLng?.lng() ?? dropPoint.lon
        setPosition({ lat, lon: lng, heading: 0 })
        mirrorToCesium(viewer, lat, lng, 0)
      })
      .catch((e: { reason?: string; message?: string }) => {
        if (cancelled) return
        setErrorReason(e.reason ?? 'load-failed')
        setLoading(false)
        const msg = e.message ?? 'Failed to load Google Maps'
        addToast('error', msg)
      })

    return () => {
      cancelled = true
      panoramaRef.current = null
    }
  }, [dropPoint, apiKey, searchRadiusM, viewer, addToast])

  /** WASD step-nav. */
  const stepForward = useCallback(() => {
    const pano = panoramaRef.current
    if (!pano) return
    const links = pano.getLinks()
    const heading = pano.getPov().heading ?? 0
    // Pick the link whose heading is closest to the current view direction.
    let best: google.maps.StreetViewLink | null = null
    let bestDiff = 180
    for (const link of links) {
      if (!link?.pano) continue
      const diff = angularDiff(link.heading ?? 0, heading)
      if (diff < bestDiff) {
        bestDiff = diff
        best = link
      }
    }
    if (best?.pano) pano.setPano(best.pano)
  }, [])

  const stepBackward = useCallback(() => {
    const pano = panoramaRef.current
    if (!pano) return
    const links = pano.getLinks()
    const heading = pano.getPov().heading ?? 0
    const reverse = (heading + 180) % 360
    let best: google.maps.StreetViewLink | null = null
    let bestDiff = 180
    for (const link of links) {
      if (!link?.pano) continue
      const diff = angularDiff(link.heading ?? 0, reverse)
      if (diff < bestDiff) {
        bestDiff = diff
        best = link
      }
    }
    if (best?.pano) pano.setPano(best.pano)
  }, [])

  const yaw = useCallback((delta: number) => {
    const pano = panoramaRef.current
    if (!pano) return
    const pov = pano.getPov()
    pano.setPov({ heading: (pov.heading + delta) % 360, pitch: pov.pitch ?? 0 })
  }, [])

  const pitch = useCallback((delta: number) => {
    const pano = panoramaRef.current
    if (!pano) return
    const pov = pano.getPov()
    const next = clamp((pov.pitch ?? 0) + delta, -70, 70)
    pano.setPov({ heading: pov.heading ?? 0, pitch: next })
  }, [])

  /** Keyboard bindings. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          if (e.key === 'ArrowUp') pitch(5)
          else stepForward()
          e.preventDefault()
          break
        case 's':
        case 'S':
        case 'ArrowDown':
          if (e.key === 'ArrowDown') pitch(-5)
          else stepBackward()
          e.preventDefault()
          break
        case 'a':
        case 'A':
        case 'ArrowLeft':
          yaw(e.key === 'ArrowLeft' ? -10 : -5)
          e.preventDefault()
          break
        case 'd':
        case 'D':
        case 'ArrowRight':
          yaw(e.key === 'ArrowRight' ? 10 : 5)
          e.preventDefault()
          break
        case 'Escape':
          onClose()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepForward, stepBackward, yaw, pitch, onClose])

  const isPhone = breakpoint === 'phone'
  const isTabletPortrait = breakpoint === 'tablet' && window.matchMedia('(orientation: portrait)').matches

  return (
    <div
      className={`${styles.panel} ${isPhone ? styles.phone : isTabletPortrait ? styles.tabletPortrait : styles.wide}`}
      role="dialog"
      aria-label="Street View"
    >
      <div className={styles.panoWrap}>
        <div ref={panoContainerRef} className={styles.pano} />
        {loading && (
          <div className={styles.overlay}>
            <span className={styles.spinner} aria-hidden />
            <span>Loading panorama…</span>
          </div>
        )}
        {errorReason === 'no-imagery' && (
          <div className={styles.overlay}>
            <span>No Street View imagery here.</span>
            <span className={styles.hint}>Drop closer to a road with Street View coverage.</span>
          </div>
        )}
        {errorReason && errorReason !== 'no-imagery' && (
          <div className={styles.overlay}>
            <span>Couldn't load Street View.</span>
            <span className={styles.hint}>
              {errorReason === 'no-key'
                ? 'Add a Google Maps API key in Settings → Google.'
                : errorReason === 'auth-failure'
                ? 'API key is invalid or domain-restricted.'
                : 'Network or quota issue — try again.'}
            </span>
          </div>
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close Street View"
          title="Close Street View (Esc)"
        >
          <X size={18} />
        </button>
        {position && !loading && (
          <div className={styles.hud}>
            <span className={styles.hudLabel}>STREET VIEW</span>
            <span className={styles.hudCoord}>
              {position.lat.toFixed(5)}, {position.lon.toFixed(5)} · hdg {Math.round(position.heading)}°
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function angularDiff(a: number, b: number): number {
  const d = ((a - b + 540) % 360) - 180
  return Math.abs(d)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function mirrorToCesium(viewer: CesiumViewer | null, lat: number, lon: number, headingDeg: number) {
  if (!viewer || viewer.isDestroyed()) return
  try {
    const pos = Cartesian3.fromDegrees(lon, lat, 100)
    viewer.camera.flyTo({
      destination: pos,
      orientation: {
        heading: CesiumMathLib.toRadians(headingDeg),
        pitch: CesiumMathLib.toRadians(-30),
        roll: 0,
      },
      duration: 0.4,
    })
  } catch {
    /* viewer destroyed mid-flight */
  }
}
