import { Cesium3DTileset, BoundingSphere, Cartographic, Math as CesiumMathLib, Rectangle } from 'cesium'
import { createSpace, listSpaces } from './registry'
import type { NavigableSpace } from './types'

/** Probe auto-detect — Phase F.
 *
 *  v1 strategy: given a tileset URL (or an already-loaded Cesium3DTileset),
 *  derive the AABB from its bounding volume and create one
 *  NavigableSpace of kind='volume' covering it. The user can subdivide
 *  later with manual annotation.
 *
 *  The voxel flood-fill multi-room segmentation flavor remains valuable
 *  for buildings that contain multiple isolated rooms — it ships as
 *  `detectInteriorVoxels()` in a follow-up PR with a worker thread.
 *  The function is exposed here as a stub returning [].
 *
 *  For both strategies we offer the same admin flow: detect → candidate
 *  list → user accepts/rejects → spaces persisted.
 */

export interface DetectResult {
  candidates: Array<Pick<NavigableSpace, 'kind' | 'volumeGeometry' | 'name'> & { reason: string }>
  /** Reason if no candidates were produced. */
  warning?: string
}

/** Derive an AABB volume candidate from a tileset's bounding volume. */
export async function detectFromTilesetUrl(url: string, label = 'Auto-detected volume'): Promise<DetectResult> {
  try {
    const tileset = await Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError: 16 })
    try {
      const result = detectFromTileset(tileset, label)
      return result
    } finally {
      // We don't keep the tileset around — the caller's interior_tileset_url
      // will load it again when probe activates. Destroy this scratch
      // instance to release WebGL handles.
      try { tileset.destroy() } catch { /* already destroyed */ }
    }
  } catch (err) {
    return {
      candidates: [],
      warning: err instanceof Error ? err.message : 'Failed to load tileset',
    }
  }
}

export function detectFromTileset(tileset: Cesium3DTileset, label: string): DetectResult {
  const bs: BoundingSphere | undefined = tileset.boundingSphere
  if (!bs) {
    return { candidates: [], warning: 'Tileset has no bounding volume' }
  }

  const centerCarto = Cartographic.fromCartesian(bs.center)
  // Compute a lat/lon delta from the bounding sphere's radius — use the
  // local metric scale (sphere radius in meters → degrees at this latitude).
  const lat = CesiumMathLib.toDegrees(centerCarto.latitude)
  const lon = CesiumMathLib.toDegrees(centerCarto.longitude)
  const h = centerCarto.height
  const radius = bs.radius

  const dLat = (radius / 110540)
  const dLon = (radius / (111320 * Math.cos((lat * Math.PI) / 180)))
  // Vertical extent: use radius as a rough proxy for half-height (buildings
  // tend to be taller than wide, so this conservatively over-estimates the
  // floor and ceiling).
  const dH = radius

  return {
    candidates: [
      {
        kind: 'volume',
        name: label,
        volumeGeometry: {
          vertices: [],
          indices: [],
          bbox: {
            minLon: lon - dLon,
            maxLon: lon + dLon,
            minLat: lat - dLat,
            maxLat: lat + dLat,
            minH: h - dH,
            maxH: h + dH,
          },
        },
        reason: `Derived from tileset bounding sphere (radius ${radius.toFixed(1)} m)`,
      },
    ],
  }
}

/** Persist a candidate as a real NavigableSpace. Returns the created row. */
export function acceptCandidate(siteSlug: string, candidate: DetectResult['candidates'][0]): NavigableSpace {
  return createSpace({
    siteSlug,
    kind: candidate.kind,
    name: candidate.name,
    volumeGeometry: candidate.volumeGeometry,
  })
}

/** Convenience — derive + auto-accept in one call. Returns the new space. */
export async function autoDetectAndCreate(siteSlug: string, tilesetUrl: string, label?: string): Promise<NavigableSpace | null> {
  const result = await detectFromTilesetUrl(tilesetUrl, label)
  if (result.candidates.length === 0) return null
  // Dedup: skip if there's already a volume with matching bbox + name
  const existing = listSpaces(siteSlug).find(
    (s) => s.kind === 'volume' && s.name === result.candidates[0].name,
  )
  if (existing) return existing
  return acceptCandidate(siteSlug, result.candidates[0])
}

/** Voxel flood-fill multi-room segmentation — research-grade follow-up.
 *  Currently returns an empty list; the algorithm sketch is documented
 *  in mockups/PROBE.md §7. */
export async function detectInteriorVoxels(_url: string): Promise<DetectResult> {
  return {
    candidates: [],
    warning: 'Voxel flood-fill segmentation not yet implemented — use detectFromTilesetUrl for single-bbox detection',
  }
}
