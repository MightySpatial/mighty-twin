/** Greedy-mesh quads → Cesium Geometry. Produces one geometry pair
 *  per chunk: an opaque pass (PositionColorNormal) and a transparent
 *  pass that also carries a per-vertex `depth` attribute consumed by
 *  the WaterShader.
 *
 *  Quad ENU positions are baked into ECEF here using the layer's
 *  datum frame, so the resulting Geometry can be wrapped by a
 *  Primitive without further modelMatrix juggling. The trade-off is
 *  that moving the datum requires a rebuild — fine for v1 since the
 *  authoring tool treats datum as a layer-creation property. */

import {
  BoundingSphere,
  Cartesian3,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  Matrix4,
  PrimitiveType,
  Transforms,
  VertexFormat,
} from 'cesium'
import type { FaceQuad, GreedyMeshOutput } from './greedyMesh'

export interface ChunkMeshOutput {
  /** Opaque-pass geometry — null when the chunk has no opaque faces. */
  opaque: Geometry | null
  /** Transparent-pass geometry — null when the chunk has no transparent
   *  faces. Carries a custom `depth` attribute (one float per vertex). */
  transparent: Geometry | null
  /** Number of triangles, useful for diagnostics. */
  triangleCount: number
}

/** Convert a layer datum (lon/lat/alt degrees+metres) to a 4x4 ENU →
 *  ECEF transform. Caller passes this matrix to `buildChunkMesh` so a
 *  whole layer's chunks share one transform without recomputing the
 *  trig per chunk. */
export function datumEnuToFixedFrame(datum: {
  lon: number
  lat: number
  alt: number
}): Matrix4 {
  const origin = Cartesian3.fromDegrees(datum.lon, datum.lat, datum.alt)
  return Transforms.eastNorthUpToFixedFrame(origin)
}

/** Allocate writable typed arrays for a quad list. Each quad becomes
 *  4 vertices and 6 indices (two triangles, CCW). */
function allocBuffers(
  quadCount: number,
  withDepth: boolean,
): {
  positions: Float64Array
  normals: Float32Array
  colors: Uint8Array
  depths: Float32Array | null
  indices: Uint32Array
} {
  const vertCount = quadCount * 4
  const indexCount = quadCount * 6
  return {
    positions: new Float64Array(vertCount * 3),
    normals: new Float32Array(vertCount * 3),
    colors: new Uint8Array(vertCount * 4),
    depths: withDepth ? new Float32Array(vertCount) : null,
    indices: new Uint32Array(indexCount),
  }
}

/** Apply the ENU→ECEF transform to a single ENU vertex, writing the
 *  resulting ECEF doubles into `positions[offset..offset+3]`. Uses a
 *  scratch Cartesian3 to keep allocation out of the inner loop. */
const SCRATCH_ENU = new Cartesian3()
const SCRATCH_ECEF = new Cartesian3()
function writeEcef(
  positions: Float64Array,
  offset: number,
  v: { x: number; y: number; z: number },
  enuToFixed: Matrix4,
): void {
  SCRATCH_ENU.x = v.x
  SCRATCH_ENU.y = v.y
  SCRATCH_ENU.z = v.z
  Matrix4.multiplyByPoint(enuToFixed, SCRATCH_ENU, SCRATCH_ECEF)
  positions[offset] = SCRATCH_ECEF.x
  positions[offset + 1] = SCRATCH_ECEF.y
  positions[offset + 2] = SCRATCH_ECEF.z
}

/** Transform an ENU normal into the world (ECEF) frame. ENU→ECEF is
 *  affine; we strip the translation and apply the rotation 3x3 to the
 *  normal. Caller pre-builds the rotation by multiplying any unit
 *  axis through the matrix and subtracting the origin, but a quicker
 *  path is `Matrix4.multiplyByPointAsVector`. */
function writeEcefNormal(
  normals: Float32Array,
  offset: number,
  n: { x: number; y: number; z: number },
  enuToFixed: Matrix4,
): void {
  SCRATCH_ENU.x = n.x
  SCRATCH_ENU.y = n.y
  SCRATCH_ENU.z = n.z
  Matrix4.multiplyByPointAsVector(enuToFixed, SCRATCH_ENU, SCRATCH_ECEF)
  // Re-normalise — the ENU→ECEF rotation is orthonormal so this is
  // mostly defensive against accumulated floating-point error.
  const len =
    Math.sqrt(
      SCRATCH_ECEF.x * SCRATCH_ECEF.x +
        SCRATCH_ECEF.y * SCRATCH_ECEF.y +
        SCRATCH_ECEF.z * SCRATCH_ECEF.z,
    ) || 1
  normals[offset] = SCRATCH_ECEF.x / len
  normals[offset + 1] = SCRATCH_ECEF.y / len
  normals[offset + 2] = SCRATCH_ECEF.z / len
}

/** Pack a 0..1 RGBA into the colour buffer at `offset` as 0..255 bytes. */
function writeColor(
  colors: Uint8Array,
  offset: number,
  c: { r: number; g: number; b: number; a: number },
): void {
  colors[offset] = Math.round(c.r * 255)
  colors[offset + 1] = Math.round(c.g * 255)
  colors[offset + 2] = Math.round(c.b * 255)
  colors[offset + 3] = Math.round(c.a * 255)
}

/** Walk a list of quads and write geometry buffers. Triangulation is
 *  CCW: indices `[0,1,2, 0,2,3]` per quad against the four vertices.
 *  Returns null if the list is empty. */
function buildGeometryFromQuads(
  quads: FaceQuad[],
  enuToFixed: Matrix4,
  withDepth: boolean,
): Geometry | null {
  if (quads.length === 0) return null

  const buf = allocBuffers(quads.length, withDepth)
  let v = 0 // vertex index
  let p = 0 // position byte offset (×3)
  let n = 0 // normal offset (×3)
  let c = 0 // color offset (×4)
  let d = 0 // depth offset (×1)
  let idx = 0 // index offset

  for (const q of quads) {
    for (let k = 0; k < 4; k += 1) {
      writeEcef(buf.positions, p, q.vertices[k], enuToFixed)
      writeEcefNormal(buf.normals, n, q.normal, enuToFixed)
      writeColor(buf.colors, c, q.color)
      if (buf.depths) buf.depths[d + k] = q.depth
      p += 3
      n += 3
      c += 4
    }
    if (buf.depths) d += 4

    buf.indices[idx] = v
    buf.indices[idx + 1] = v + 1
    buf.indices[idx + 2] = v + 2
    buf.indices[idx + 3] = v
    buf.indices[idx + 4] = v + 2
    buf.indices[idx + 5] = v + 3
    idx += 6
    v += 4
  }

  const attributes: Record<string, GeometryAttribute> = {
    position: new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: buf.positions,
    }),
    normal: new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 3,
      values: buf.normals,
    }),
    color: new GeometryAttribute({
      componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
      componentsPerAttribute: 4,
      values: buf.colors,
      normalize: true,
    }),
  }
  if (buf.depths) {
    attributes.depth = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 1,
      values: buf.depths,
    })
  }

  return new Geometry({
    attributes: attributes as unknown as Geometry['attributes'],
    indices: buf.indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(
      buf.positions as unknown as number[],
    ),
  })
}

/** Build the per-pass geometries for a chunk's greedy-mesh output. */
export function buildChunkMesh(
  mesh: GreedyMeshOutput,
  enuToFixed: Matrix4,
): ChunkMeshOutput {
  const opaque = buildGeometryFromQuads(mesh.opaque, enuToFixed, false)
  const transparent = buildGeometryFromQuads(mesh.transparent, enuToFixed, true)
  return {
    opaque,
    transparent,
    triangleCount: (mesh.opaque.length + mesh.transparent.length) * 2,
  }
}

/** Cesium VertexFormat used by both passes. VertexFormat itself
 *  doesn't have a `color` slot — colour is supplied as an extra
 *  per-vertex Geometry attribute that the custom shader reads
 *  alongside position + normal. Declaring POSITION_AND_NORMAL keeps
 *  Cesium's shader-program matcher honest about what we promise. */
export const VOXEL_VERTEX_FORMAT: VertexFormat = VertexFormat.POSITION_AND_NORMAL
