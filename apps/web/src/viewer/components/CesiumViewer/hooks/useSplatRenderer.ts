/** Gaussian-splat rendering on top of Cesium.
 *
 *  Approach: a transparent canvas overlay sits exactly over Cesium's
 *  canvas; gsplat.js renders the loaded splats into it. Each frame we
 *  copy Cesium's camera pose into a gsplat Camera so the two views
 *  stay locked together.
 *
 *  Coordinate alignment: the splat is rendered in its own local frame
 *  (origin at layer.style.anchor, axes = ENU at that point — east X,
 *  north Y, up Z). Each frame we:
 *    1. Read Cesium's camera position + basis vectors in ECEF.
 *    2. Build the ENU→ECEF transform at the anchor.
 *    3. Express the Cesium camera in ENU = splat-local coords.
 *    4. Drive the gsplat Camera with that pose.
 *
 *  Limits this turn:
 *    - One canvas per viewer, scoped to a single composite scene with
 *      every active splat layer added as a child. We cycle through
 *      layers in render order.
 *    - The two contexts don't share a depth buffer, so the splat
 *      renders OVER the Cesium globe (the volumetric box marker we
 *      drop alongside is the user's hint at where the splat would be
 *      occluded by terrain).
 *    - Splats are loaded once, kept in cache. Network failures fall
 *      back to the volumetric box already drawn by useLayerSync.
 */

import { useEffect, useRef } from 'react'
import {
  Cartesian3 as CCart3,
  Cartographic,
  Matrix3 as CMat3,
  Matrix4 as CMat4,
  Transforms,
  type Viewer as CesiumViewerType,
} from 'cesium'
import {
  Camera as GsCamera,
  Loader as GsLoader,
  Matrix3 as GsMat3,
  Quaternion as GsQuat,
  Scene as GsScene,
  Splat as GsSplat,
  Vector3 as GsVec3,
  WebGLRenderer as GsRenderer,
} from 'gsplat'
import type { Layer } from '../types'

interface SplatRecord {
  url: string
  splat: GsSplat | null
  loadError: string | null
  anchor: { lon: number; lat: number; height: number }
  /** ENU→ECEF at the anchor; cached so we don't recompute every frame. */
  enuToEcef: CMat4
  ecefToEnu: CMat4
}

export function useSplatRenderer(
  viewerRef: React.RefObject<CesiumViewerType | null>,
  layers: Layer[],
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<GsRenderer | null>(null)
  const sceneRef = useRef<GsScene | null>(null)
  const cameraRef = useRef<GsCamera | null>(null)
  const recordsRef = useRef<Map<string, SplatRecord>>(new Map())

  // Mount the overlay canvas + renderer once per viewer instance.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const cesiumCanvas = viewer.canvas
    const parent = cesiumCanvas.parentElement
    if (!parent) return

    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.pointerEvents = 'none'
    canvas.width = cesiumCanvas.clientWidth
    canvas.height = cesiumCanvas.clientHeight
    parent.appendChild(canvas)

    let renderer: GsRenderer
    try {
      renderer = new GsRenderer(canvas)
    } catch (err) {
      // No WebGL2 → bail. The volumetric box from useLayerSync still
      // renders so users see *where* the splat is, just not the cloud.
      console.warn('[splat] gsplat renderer init failed', err)
      parent.removeChild(canvas)
      return
    }
    const scene = new GsScene()
    const camera = new GsCamera()

    canvasRef.current = canvas
    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera

    // Resize listener — Cesium's canvas can change with sidebar toggles.
    const resize = () => {
      canvas.width = cesiumCanvas.clientWidth
      canvas.height = cesiumCanvas.clientHeight
      renderer.setSize(canvas.width, canvas.height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(cesiumCanvas)

    // Per-frame camera sync + render. Cesium dispatches preRender on
    // every animation frame regardless of whether the scene changed —
    // perfect hook for keeping the splat overlay in lockstep.
    const off = viewer.scene.preRender.addEventListener(() => {
      try {
        renderActiveSplats(viewer, renderer, scene, camera, recordsRef.current, canvas)
      } catch (err) {
        // Swallow render errors — a single bad splat shouldn't kill
        // the whole frame loop.
        console.warn('[splat] render error', err)
      }
    })

    return () => {
      off()
      observer.disconnect()
      try {
        renderer.dispose()
      } catch {
        /* already disposed */
      }
      try {
        parent.removeChild(canvas)
      } catch {
        /* already removed */
      }
      canvasRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      recordsRef.current.clear()
    }
  }, [viewerRef])

  // Reconcile splat records with the current layers list. Add records
  // for new splats, remove for layers that disappeared, leave the
  // already-loaded ones alone.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const records = recordsRef.current
    const seen = new Set<string>()

    for (const layer of layers) {
      if (layer.type !== 'splat' || !layer.url) continue
      seen.add(layer.id)
      const anchor = layer.style?.anchor as
        | { lon: number; lat: number; height?: number }
        | undefined
      if (!anchor) continue
      if (records.has(layer.id)) {
        // Update anchor on existing record (admin may have moved it)
        const rec = records.get(layer.id)!
        if (
          rec.anchor.lon !== anchor.lon ||
          rec.anchor.lat !== anchor.lat ||
          (rec.anchor.height ?? 0) !== (anchor.height ?? 0)
        ) {
          rec.anchor = { lon: anchor.lon, lat: anchor.lat, height: anchor.height ?? 0 }
          rec.enuToEcef = Transforms.eastNorthUpToFixedFrame(
            CCart3.fromDegrees(anchor.lon, anchor.lat, anchor.height ?? 0),
          )
          rec.ecefToEnu = CMat4.inverseTransformation(rec.enuToEcef, new CMat4())
        }
        continue
      }
      const enuToEcef = Transforms.eastNorthUpToFixedFrame(
        CCart3.fromDegrees(anchor.lon, anchor.lat, anchor.height ?? 0),
      )
      const ecefToEnu = CMat4.inverseTransformation(enuToEcef, new CMat4())
      const rec: SplatRecord = {
        url: layer.url,
        splat: null,
        loadError: null,
        anchor: { lon: anchor.lon, lat: anchor.lat, height: anchor.height ?? 0 },
        enuToEcef,
        ecefToEnu,
      }
      records.set(layer.id, rec)
      // Async-load the splat. Once loaded, it's added to the scene.
      GsLoader.LoadAsync(layer.url, scene)
        .then((splat) => {
          rec.splat = splat
        })
        .catch((err) => {
          rec.loadError = String(err)
          console.warn('[splat] load failed', layer.url, err)
        })
    }

    // Remove records for layers that are no longer present.
    for (const [id, rec] of records.entries()) {
      if (!seen.has(id)) {
        if (rec.splat) {
          try {
            scene.removeObject(rec.splat)
          } catch {
            /* already detached */
          }
        }
        records.delete(id)
      }
    }
  }, [layers])
}

// ── Per-frame render ────────────────────────────────────────────────────

function renderActiveSplats(
  viewer: CesiumViewerType,
  renderer: GsRenderer,
  scene: GsScene,
  camera: GsCamera,
  records: Map<string, SplatRecord>,
  canvas: HTMLCanvasElement,
) {
  if (records.size === 0 || scene.objects.length === 0) return
  // Match the canvas size to Cesium's drawing buffer. Cheap if unchanged.
  if (
    canvas.width !== viewer.canvas.clientWidth ||
    canvas.height !== viewer.canvas.clientHeight
  ) {
    canvas.width = viewer.canvas.clientWidth
    canvas.height = viewer.canvas.clientHeight
    renderer.setSize(canvas.width, canvas.height)
  }

  // For multiple splats: render each one individually, parking the
  // others (we'd need a per-splat camera transform). For the v1 we
  // use the FIRST splat record as the anchor frame — works perfectly
  // for the most common "one building per site" case. Multi-splat
  // sites will land in a follow-up that runs N render passes.
  const first = records.values().next().value
  if (!first || !first.splat) return
  const rec = first

  // Camera pose in ECEF
  const camPosEcef = viewer.camera.position
  const right = viewer.camera.right
  const up = viewer.camera.up
  const dir = viewer.camera.direction

  // Camera position in splat-local (ENU) frame
  const camPosEnu = CMat4.multiplyByPoint(
    rec.ecefToEnu,
    camPosEcef,
    new CCart3(),
  )

  // Rotate basis vectors into the ENU frame (translation-free).
  const rotEcefToEnu = CMat4.getMatrix3(rec.ecefToEnu, new CMat3())
  const rEnu = CMat3.multiplyByVector(rotEcefToEnu, right, new CCart3())
  const uEnu = CMat3.multiplyByVector(rotEcefToEnu, up, new CCart3())
  const dEnu = CMat3.multiplyByVector(rotEcefToEnu, dir, new CCart3())

  // Quaternion from camera basis. gsplat / three.js convention: the
  // camera looks down -Z (so +Z is "back"), +Y is up, +X is right.
  // The rotation matrix whose columns are (right, up, back) takes
  // camera-local axes to world. Pass as Matrix3 rows = transposed cols.
  const back = { x: -dEnu.x, y: -dEnu.y, z: -dEnu.z }
  const m = new GsMat3(
    rEnu.x, uEnu.x, back.x,
    rEnu.y, uEnu.y, back.y,
    rEnu.z, uEnu.z, back.z,
  )
  const q = GsQuat.FromMatrix3(m)
  camera.position = new GsVec3(camPosEnu.x, camPosEnu.y, camPosEnu.z)
  camera.rotation = q

  // FOV — match Cesium's perspective frustum. fovy is vertical FOV
  // in radians; gsplat uses focal-length style fx / fy.
  const fr = viewer.camera.frustum as { fovy?: number; aspectRatio?: number; near?: number; far?: number }
  const fovy = typeof fr.fovy === 'number' ? fr.fovy : Math.PI / 3
  const cd = camera.data
  cd.setSize(canvas.width, canvas.height)
  cd.fy = canvas.height / 2 / Math.tan(fovy / 2)
  cd.fx = cd.fy
  cd.near = typeof fr.near === 'number' && fr.near > 0 ? fr.near : 0.05
  cd.far = typeof fr.far === 'number' && fr.far > 0 ? fr.far : 1e7
  cd.update(camera.position, camera.rotation)

  renderer.render(scene, camera)
}

// Suppress 'unused' lint on Cartographic — kept around for future
// underground-vs-aboveground checks.
void Cartographic
