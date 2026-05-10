/** Per-chunk Cesium primitive wrapper. Holds at most two Cesium
 *  Primitives (one opaque pass, one transparent pass) and rebuilds
 *  them on demand. Owns its own scene attachments — `destroy()`
 *  removes both primitives from the scene's primitive collection. */

import {
  GeometryInstance,
  Matrix4,
  Primitive,
  type Scene,
} from 'cesium'
import { buildChunkMesh, datumEnuToFixedFrame } from './chunkMesh'
import { greedyMesh } from './greedyMesh'
import { makeSolidAppearance, makeWaterAppearance } from './WaterShader'
import type { SVOChunk, SVOLayer } from '../types'

export interface ChunkPrimitiveOptions {
  /** Absorption coefficient for the water shader. Higher = murkier. */
  absorptionCoeff?: number
  /** When true, primitives compile asynchronously (default). Tests /
   *  capture flows can pass `false` to force a synchronous build. */
  asynchronous?: boolean
}

export class ChunkPrimitive {
  private scene: Scene
  private opaque: Primitive | null = null
  private transparent: Primitive | null = null
  private lastChunkLevel = -1
  private options: Required<ChunkPrimitiveOptions>

  constructor(scene: Scene, options: ChunkPrimitiveOptions = {}) {
    this.scene = scene
    this.options = {
      absorptionCoeff: options.absorptionCoeff ?? 1.0,
      asynchronous: options.asynchronous ?? true,
    }
  }

  /** Build / rebuild this chunk's primitives from the current chunk
   *  contents. Drops any pre-existing primitives. The caller normally
   *  flips `chunk.meshDirty = false` after a successful build. */
  build(chunk: SVOChunk, layer: SVOLayer): void {
    this.disposePrimitives()

    const enuToFixed = datumEnuToFixedFrame(layer.datum)
    const mesh = greedyMesh(chunk)
    const built = buildChunkMesh(mesh, enuToFixed)
    this.lastChunkLevel = chunk.level

    if (built.opaque) {
      const inst = new GeometryInstance({
        geometry: built.opaque,
        modelMatrix: Matrix4.IDENTITY,
        id: `voxel:${layer.id}:${chunk.ci}|${chunk.cj}|${chunk.ck}|${chunk.level}:opaque`,
      })
      this.opaque = new Primitive({
        geometryInstances: inst,
        appearance: makeSolidAppearance(),
        asynchronous: this.options.asynchronous,
        compressVertices: false,
      })
      this.scene.primitives.add(this.opaque)
    }

    if (built.transparent) {
      const inst = new GeometryInstance({
        geometry: built.transparent,
        modelMatrix: Matrix4.IDENTITY,
        id: `voxel:${layer.id}:${chunk.ci}|${chunk.cj}|${chunk.ck}|${chunk.level}:water`,
      })
      this.transparent = new Primitive({
        geometryInstances: inst,
        appearance: makeWaterAppearance(this.options.absorptionCoeff),
        asynchronous: this.options.asynchronous,
        compressVertices: false,
        // Water sorts after opaque; Cesium's translucent pass handles
        // back-to-front sorting automatically once `translucent: true`
        // is set on the appearance.
      })
      this.scene.primitives.add(this.transparent)
    }
  }

  /** Re-mesh + re-attach if the chunk is flagged `meshDirty`. The
   *  rebuild is intentionally a full mesh swap rather than a buffer
   *  patch — Cesium primitives don't support attribute streaming for
   *  custom geometries, and the typical edit footprint is small
   *  enough that the full rebuild is well under a frame on modern
   *  hardware. */
  update(chunk: SVOChunk, layer: SVOLayer): boolean {
    if (!chunk.meshDirty && this.opaque !== null) return false
    this.build(chunk, layer)
    return true
  }

  /** Tear down any attached primitives. Idempotent. */
  destroy(): void {
    this.disposePrimitives()
  }

  /** Internal: remove both primitives from the scene if present. */
  private disposePrimitives(): void {
    if (this.opaque) {
      try {
        this.scene.primitives.remove(this.opaque)
      } catch {
        /* scene already torn down */
      }
      this.opaque = null
    }
    if (this.transparent) {
      try {
        this.scene.primitives.remove(this.transparent)
      } catch {
        /* scene already torn down */
      }
      this.transparent = null
    }
  }

  /** Diagnostic — current opaque + transparent primitive presence. */
  hasGeometry(): boolean {
    return this.opaque !== null || this.transparent !== null
  }

  /** Diagnostic — last built chunk level (for level-of-detail logic
   *  in VoxelRenderer.sync). */
  level(): number {
    return this.lastChunkLevel
  }
}
