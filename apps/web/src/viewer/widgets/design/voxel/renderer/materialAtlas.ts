/** Material atlas — colour palette for every BlockType, broken out
 *  per-face so the greedy mesher can pick top/side/bottom shades and
 *  fake some directional shading without a full lighting pass.
 *
 *  Colours are tuned for a geology / civils palette: rocks lean
 *  grey-brown, ore is yellow-ochre, concrete is light-grey, water
 *  is a teal #006994 with a 0.35 base alpha (the WaterShader
 *  computes the *final* alpha from per-vertex depth). */

import type { BlockFace, BlockType } from '../types'

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

interface MaterialEntry {
  topColor: RGBA
  sideColor: RGBA
  bottomColor: RGBA
  isTransparent: boolean
  baseAlpha: number
}

const op = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a })

/** RRGGBB hex → linearish 0..1 RGBA. We deliberately don't sRGB-decode
 *  here; Cesium's per-vertex colour pipeline expects linear-ish 0..1
 *  values that gamma blend acceptably for an authoring preview. */
function hex(rgb: string, a = 1): RGBA {
  const v = rgb.replace('#', '')
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  return { r, g, b, a }
}

/** Slightly darken / lighten an RGBA — used to derive bottomColor /
 *  sideColor when only one base hex is given. Multiplies the RGB
 *  channels and clamps to [0,1]. */
function shade(c: RGBA, factor: number): RGBA {
  return {
    r: Math.max(0, Math.min(1, c.r * factor)),
    g: Math.max(0, Math.min(1, c.g * factor)),
    b: Math.max(0, Math.min(1, c.b * factor)),
    a: c.a,
  }
}

/** Build a top/side/bottom triple from one base colour by darkening
 *  sides 0.85× and bottom 0.65×. Saves repetition for the simple
 *  geology entries below. */
function fromBase(base: RGBA, opts?: { side?: number; bottom?: number }): {
  topColor: RGBA
  sideColor: RGBA
  bottomColor: RGBA
} {
  const s = opts?.side ?? 0.85
  const b = opts?.bottom ?? 0.65
  return {
    topColor: base,
    sideColor: shade(base, s),
    bottomColor: shade(base, b),
  }
}

const ATLAS: Record<BlockType, MaterialEntry> = {
  air: {
    topColor: op(0, 0, 0, 0),
    sideColor: op(0, 0, 0, 0),
    bottomColor: op(0, 0, 0, 0),
    isTransparent: true,
    baseAlpha: 0,
  },
  terrain: {
    ...fromBase(hex('7a8a5c')),
    isTransparent: false,
    baseAlpha: 1,
  },
  rock: {
    // Grey-brown — neutral mid value, slight warm tint for non-OBE
    // geology presentation.
    ...fromBase(hex('6b6258')),
    isTransparent: false,
    baseAlpha: 1,
  },
  ore: {
    // Yellow-ochre — high saturation so it pops against the rock
    // matrix in cross-section views.
    ...fromBase(hex('c89b3c')),
    isTransparent: false,
    baseAlpha: 1,
  },
  overburden: {
    // Sandy-brown, lighter than rock, redder than topsoil.
    ...fromBase(hex('a89072')),
    isTransparent: false,
    baseAlpha: 1,
  },
  fill: {
    // Mid-grey — engineered fill, no warm bias.
    ...fromBase(hex('8a8a8a')),
    isTransparent: false,
    baseAlpha: 1,
  },
  concrete: {
    ...fromBase(hex('c8c8c8'), { side: 0.92, bottom: 0.78 }),
    isTransparent: false,
    baseAlpha: 1,
  },
  steel: {
    // Cool blue-grey — clearly distinguishable from concrete.
    ...fromBase(hex('6e7d8c')),
    isTransparent: false,
    baseAlpha: 1,
  },
  water: {
    // Teal-blue base. Side/bottom kept identical; the WaterShader
    // does the deep→shallow lerp itself.
    topColor: hex('006994', 0.35),
    sideColor: hex('006994', 0.35),
    bottomColor: hex('006994', 0.35),
    isTransparent: true,
    baseAlpha: 0.35,
  },
  topsoil: {
    // Dark earth brown.
    ...fromBase(hex('4a3a28'), { side: 0.9, bottom: 0.7 }),
    isTransparent: false,
    baseAlpha: 1,
  },
  custom: {
    // Sentinel — magenta so missing/uncategorised blocks are obviously
    // wrong rather than silently invisible.
    ...fromBase(hex('ff00ff')),
    isTransparent: false,
    baseAlpha: 1,
  },
}

/** Look up the colour for a (type, face) pair. `top` and `bottom`
 *  faces use their own shades; the four side faces share the side
 *  shade for now (per-direction shading — N/S/E/W differing — would
 *  need a normal-aware path that the textured mode owns). */
export function getMaterialColor(type: BlockType, face: BlockFace): RGBA {
  const entry = ATLAS[type] ?? ATLAS.custom
  if (face === 'top') return entry.topColor
  if (face === 'bottom') return entry.bottomColor
  return entry.sideColor
}

export function isTransparent(type: BlockType): boolean {
  return ATLAS[type]?.isTransparent ?? false
}

export function getBaseAlpha(type: BlockType): number {
  return ATLAS[type]?.baseAlpha ?? 1
}
