/** Custom Cesium Appearance for the transparent (water) pass.
 *
 *  The shader takes per-vertex `position`, `normal`, `color` (RGBA
 *  from the material atlas) and the custom `depth` attribute (water
 *  blocks immediately below this face). It computes:
 *
 *  1. alpha = clamp(1.0 - exp(-absorption * depth * 0.125), 0.2, 0.9)
 *     — Beer-Lambert absorption, tunable per-water-body via the
 *     `absorptionCoeff` uniform.
 *  2. Colour lerp from a teal `vec3(0.0, 0.42, 0.58)` shallow tone
 *     to a deep navy `vec3(0.0, 0.08, 0.25)` at depth ≥ 20 blocks.
 *  3. A Fresnel-style edge brightening (`pow(1 - n·v, 3)`) so the
 *     water has a soft cyan rim against viewing-glance angles.
 *  4. A subtle sine-driven normal wobble keyed to `czm_frameNumber`
 *     so the surface looks alive without relying on a normal map. */

import { Appearance } from 'cesium'
import { VOXEL_VERTEX_FORMAT } from './chunkMesh'

const VS = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;
in float depth;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec4 v_color;
out float v_depth;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_color = color;
  v_depth = depth;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`

const FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;
in float v_depth;

uniform float u_absorption;

void main() {
  // Animated surface ripple: perturb the normal with a small sine
  // term keyed to the frame counter so the highlight glides over
  // the surface instead of looking like a flat poster.
  float t = czm_frameNumber * 0.012;
  vec3 wobble = vec3(
    sin(t + v_positionEC.x * 0.04) * 0.06,
    cos(t + v_positionEC.y * 0.04) * 0.06,
    0.0
  );
  vec3 N = normalize(v_normalEC + wobble);

  // View vector (camera at origin in eye-space).
  vec3 V = normalize(-v_positionEC);

  // Beer-Lambert-style absorption: deeper water → higher alpha,
  // clamped so very thin layers stay readable and very deep
  // sections don't become indistinguishable from opaque.
  float a = clamp(1.0 - exp(-u_absorption * v_depth * 0.125), 0.2, 0.9);

  // Depth lerp 0..20 blocks → shallow teal → deep navy.
  vec3 shallow = vec3(0.0, 0.42, 0.58);
  vec3 deep = vec3(0.0, 0.08, 0.25);
  float dt = clamp(v_depth / 20.0, 0.0, 1.0);
  vec3 base = mix(shallow, deep, dt);

  // Fresnel rim — soft cyan-white at glancing angles.
  float fres = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
  vec3 rim = vec3(0.55, 0.85, 0.95) * fres * 0.6;

  vec3 rgb = base + rim;
  // Multiply through by the per-vertex colour's RGB so a custom-
  // tinted water variant from the atlas (e.g. a stagnant pond)
  // still influences the final hue.
  rgb *= mix(vec3(1.0), v_color.rgb, 0.3);

  out_FragColor = vec4(rgb, a * v_color.a / 0.35);
}
`

/** Build a translucent Appearance suitable for the chunk's water
 *  geometry. `absorptionCoeff` defaults to 1.0 (clear water); muddier
 *  bodies should pass higher values (1.5–2.5). Cesium accepts a plain
 *  render-state object on the Appearance constructor and feeds it
 *  through its internal `RenderState.fromCache`. */
export function makeWaterAppearance(absorptionCoeff = 1.0): Appearance {
  const appearance = new Appearance({
    translucent: true,
    closed: false,
    vertexShaderSource: VS,
    fragmentShaderSource: FS,
    renderState: {
      cull: { enabled: false },
      depthTest: { enabled: true },
      depthMask: false,
      blending: {
        enabled: true,
        equationRgb: 32774, // FUNC_ADD
        equationAlpha: 32774,
        functionSourceRgb: 770, // SRC_ALPHA
        functionSourceAlpha: 770,
        functionDestinationRgb: 771, // ONE_MINUS_SRC_ALPHA
        functionDestinationAlpha: 771,
      },
    },
  })

  // Stash the uniform map on the appearance — the ChunkPrimitive
  // wraps the GeometryInstance with this appearance, and Cesium
  // reads `appearance.uniformMap` (when present) at draw-command
  // creation. This keeps the absorption coeff per-layer-tunable
  // without rebuilding the shader for each chunk.
  ;(appearance as unknown as { uniformMap?: Record<string, () => unknown> }).uniformMap = {
    u_absorption: () => absorptionCoeff,
  }

  // The Appearance API exposes vertexFormat as a getter; some pipeline
  // sites read it to confirm the geometry has what the shader needs.
  // We declare POSITION_AND_NORMAL and rely on the geometry attributes
  // (color + depth) being read by attribute-name lookup.
  Object.defineProperty(appearance, 'vertexFormat', {
    value: VOXEL_VERTEX_FORMAT,
    writable: false,
    enumerable: true,
  })

  return appearance
}

/** Companion appearance for the opaque pass — same vertex/fragment
 *  scaffold, no transparency, simple Lambert with a small ambient.
 *  Lives here so the two appearances share the colour-attribute and
 *  position-handling conventions. */
export function makeSolidAppearance(): Appearance {
  const VS_SOLID = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;

out vec3 v_normalEC;
out vec4 v_color;

void main() {
  vec4 p = czm_computePosition();
  v_normalEC = czm_normal * normal;
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`

  const FS_SOLID = /* glsl */ `
in vec3 v_normalEC;
in vec4 v_color;

void main() {
  vec3 N = normalize(v_normalEC);
  // Light direction — sun-ish, slightly above the camera-right.
  vec3 L = normalize(vec3(0.4, 0.3, 0.85));
  float ndotl = max(dot(N, L), 0.0);
  float ambient = 0.35;
  float lambert = ambient + (1.0 - ambient) * ndotl;
  out_FragColor = vec4(v_color.rgb * lambert, v_color.a);
}
`

  const appearance = new Appearance({
    translucent: false,
    closed: true,
    vertexShaderSource: VS_SOLID,
    fragmentShaderSource: FS_SOLID,
    renderState: {
      cull: { enabled: true, face: 0x0405 /* GL_BACK */ },
      depthTest: { enabled: true },
      depthMask: true,
    },
  })

  Object.defineProperty(appearance, 'vertexFormat', {
    value: VOXEL_VERTEX_FORMAT,
    writable: false,
    enumerable: true,
  })

  return appearance
}

/** Wireframe appearance — renders only the edges of greedy-meshed
 *  quads via screen-space derivatives of the eye-space position. We
 *  exploit the fact that voxel meshes are axis-aligned in their local
 *  frame, so fract(position) jumps at every block boundary; fwidth
 *  expands those jumps into a 1-pixel band we can stroke. Inside the
 *  band → opaque colour, outside → discard. Translucent flag is true
 *  because empty pixels still need to alpha-blend correctly with the
 *  globe and other chunks. */
export function makeWireframeAppearance(): Appearance {
  const VS = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec4 v_color;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`
  const FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;

void main() {
  // Distance to the nearest unit-grid line, axis-aligned in eye-
  // space. Voxel block edges land on integer steps in the local
  // frame; in eye-space the rotation is constant per draw so the
  // grid is still axis-aligned. One-pixel anti-aliased band via
  // fwidth.
  vec3 f = fract(v_positionEC);
  vec3 d = min(f, 1.0 - f);
  vec3 w = fwidth(v_positionEC) * 1.2;
  float gx = smoothstep(0.0, w.x, d.x);
  float gy = smoothstep(0.0, w.y, d.y);
  float gz = smoothstep(0.0, w.z, d.z);
  // Edge = at least one axis is right at a block boundary. Take the
  // two smallest "distance-to-line" values; an edge of the cube is
  // where two of the three axes are simultaneously on a boundary.
  float a = min(gx, min(gy, gz));
  float b = max(gx, min(gy, gz));
  float edge = 1.0 - max(a, b);
  if (edge < 0.05) discard;
  // Edge colour: white-ish tinted by the per-vertex colour so the
  // material atlas still tells dirt from stone at a glance.
  vec3 rgb = mix(vec3(1.0), v_color.rgb, 0.35);
  out_FragColor = vec4(rgb, edge);
}
`
  const appearance = new Appearance({
    translucent: true,
    closed: false,
    vertexShaderSource: VS,
    fragmentShaderSource: FS,
    renderState: {
      cull: { enabled: false },
      depthTest: { enabled: true },
      depthMask: false,
      blending: {
        enabled: true,
        equationRgb: 32774,
        equationAlpha: 32774,
        functionSourceRgb: 770,
        functionSourceAlpha: 770,
        functionDestinationRgb: 771,
        functionDestinationAlpha: 771,
      },
    },
  })
  Object.defineProperty(appearance, 'vertexFormat', {
    value: VOXEL_VERTEX_FORMAT,
    writable: false,
    enumerable: true,
  })
  return appearance
}

/** X-ray appearance — semi-transparent geometry with a Fresnel rim so
 *  edges read clearly while the interior stays see-through enough to
 *  expose underground / occluded structures. Fixed alpha floor of
 *  0.18, ramped up to 0.65 at glancing angles. Lit by the same sun
 *  direction as the solid pass so the silhouette doesn't go flat. */
export function makeXrayAppearance(): Appearance {
  const VS = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec4 v_color;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`
  const FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;

void main() {
  vec3 N = normalize(v_normalEC);
  vec3 V = normalize(-v_positionEC);
  float fres = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 2.0);
  // Soft Lambert so the silhouette has shape, blended with the
  // Fresnel rim so edges glow. Alpha = base floor + Fresnel.
  vec3 L = normalize(vec3(0.4, 0.3, 0.85));
  float ndotl = max(dot(N, L), 0.0);
  float lit = 0.55 + 0.45 * ndotl;
  vec3 rgb = v_color.rgb * lit + vec3(0.6, 0.85, 1.0) * fres * 0.4;
  float a = 0.18 + fres * 0.47;
  out_FragColor = vec4(rgb, a);
}
`
  const appearance = new Appearance({
    translucent: true,
    closed: false,
    vertexShaderSource: VS,
    fragmentShaderSource: FS,
    renderState: {
      cull: { enabled: false },
      depthTest: { enabled: true },
      depthMask: false,
      blending: {
        enabled: true,
        equationRgb: 32774,
        equationAlpha: 32774,
        functionSourceRgb: 770,
        functionSourceAlpha: 770,
        functionDestinationRgb: 771,
        functionDestinationAlpha: 771,
      },
    },
  })
  Object.defineProperty(appearance, 'vertexFormat', {
    value: VOXEL_VERTEX_FORMAT,
    writable: false,
    enumerable: true,
  })
  return appearance
}
