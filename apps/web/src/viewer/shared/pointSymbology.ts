/**
 * MightyTwin — Point Symbology
 * Shared utility for rendering point symbols as canvas images for Cesium billboards.
 * 50 symbols across 3 categories: shapes, pins, emoji.
 */

export type PointSymbolCategory = 'shapes' | 'pins' | 'emoji'

export interface PointSymbolDef {
  id: string
  label: string
  category: PointSymbolCategory
  emoji?: string
}

export const POINT_SYMBOL_DEFS: PointSymbolDef[] = [
  // ── SHAPES ──────────────────────────────────────────────────────────────────
  { id: 'circle',        label: 'Circle',        category: 'shapes' },
  { id: 'square',        label: 'Square',        category: 'shapes' },
  { id: 'diamond',       label: 'Diamond',       category: 'shapes' },
  { id: 'triangle-up',   label: 'Triangle ▲',    category: 'shapes' },
  { id: 'triangle-down', label: 'Triangle ▼',    category: 'shapes' },
  { id: 'pentagon',      label: 'Pentagon',       category: 'shapes' },
  { id: 'hexagon',       label: 'Hexagon',       category: 'shapes' },
  { id: 'octagon',       label: 'Octagon',       category: 'shapes' },
  { id: 'star-4',        label: 'Star 4pt',      category: 'shapes' },
  { id: 'star-5',        label: 'Star 5pt',      category: 'shapes' },
  { id: 'star-6',        label: 'Star 6pt',      category: 'shapes' },
  { id: 'cross',         label: 'Cross +',       category: 'shapes' },
  { id: 'x-mark',        label: 'X Mark',        category: 'shapes' },
  { id: 'arrow-up',      label: 'Arrow Up',      category: 'shapes' },
  { id: 'arrow-right',   label: 'Arrow →',       category: 'shapes' },
  { id: 'donut',         label: 'Donut',         category: 'shapes' },

  // ── PINS ────────────────────────────────────────────────────────────────────
  { id: 'pin',           label: 'Pin Filled',    category: 'pins' },
  { id: 'pin-outline',   label: 'Pin Outline',   category: 'pins' },
  { id: 'pin-dot',       label: 'Pin + Dot',     category: 'pins' },
  { id: 'pushpin',       label: 'Pushpin',       category: 'pins' },
  { id: 'flag',          label: 'Flag',          category: 'pins' },
  { id: 'marker',        label: 'Marker',        category: 'pins' },
  { id: 'beacon',        label: 'Beacon',        category: 'pins' },

  // ── EMOJI (Noto Color Emoji, Apache 2.0) ────────────────────────────────────
  { id: 'em-red',        label: 'Red',           category: 'emoji', emoji: '🔴' },
  { id: 'em-orange',     label: 'Orange',        category: 'emoji', emoji: '🟠' },
  { id: 'em-yellow',     label: 'Yellow',        category: 'emoji', emoji: '🟡' },
  { id: 'em-green',      label: 'Green',         category: 'emoji', emoji: '🟢' },
  { id: 'em-blue',       label: 'Blue',          category: 'emoji', emoji: '🔵' },
  { id: 'em-purple',     label: 'Purple',        category: 'emoji', emoji: '🟣' },
  { id: 'em-black',      label: 'Black',         category: 'emoji', emoji: '⚫' },
  { id: 'em-white',      label: 'White',         category: 'emoji', emoji: '⚪' },
  { id: 'em-warning',    label: 'Warning',       category: 'emoji', emoji: '⚠️' },
  { id: 'em-stop',       label: 'Stop',          category: 'emoji', emoji: '⛔' },
  { id: 'em-check',      label: 'Check',         category: 'emoji', emoji: '✅' },
  { id: 'em-cross',      label: 'No',            category: 'emoji', emoji: '❌' },
  { id: 'em-bell',       label: 'Alert',         category: 'emoji', emoji: '🔔' },
  { id: 'em-pin',        label: 'Map Pin',       category: 'emoji', emoji: '📍' },
  { id: 'em-flag',       label: 'Flag',          category: 'emoji', emoji: '🚩' },
  { id: 'em-finish',     label: 'Finish',        category: 'emoji', emoji: '🏁' },
  { id: 'em-star',       label: 'Star',          category: 'emoji', emoji: '⭐' },
  { id: 'em-bulb',       label: 'Idea',          category: 'emoji', emoji: '💡' },
  { id: 'em-fire',       label: 'Fire',          category: 'emoji', emoji: '🔥' },
  { id: 'em-water',      label: 'Water',         category: 'emoji', emoji: '💧' },
  { id: 'em-plant',      label: 'Plant',         category: 'emoji', emoji: '🌿' },
  { id: 'em-construct',  label: 'Construction',  category: 'emoji', emoji: '🏗️' },
  { id: 'em-roadworks',  label: 'Roadworks',     category: 'emoji', emoji: '🚧' },
  { id: 'em-lightning',  label: 'Power',         category: 'emoji', emoji: '⚡' },
  { id: 'em-antenna',    label: 'Signal',        category: 'emoji', emoji: '📡' },
  { id: 'em-satellite',  label: 'Satellite',     category: 'emoji', emoji: '🛰️' },
  { id: 'em-building',   label: 'Building',      category: 'emoji', emoji: '🏢' },
  { id: 'em-house',      label: 'House',         category: 'emoji', emoji: '🏠' },
  { id: 'em-tools',      label: 'Maintenance',   category: 'emoji', emoji: '🔧' },
  { id: 'em-camera',     label: 'Camera',        category: 'emoji', emoji: '📷' },
]

/** Backward-compat: symbolType is now a free string (any id from POINT_SYMBOL_DEFS). */
export type PointSymbolType = string

/** Backward-compat: flat list of all symbol ids. */
export const POINT_SYMBOL_TYPES: string[] = POINT_SYMBOL_DEFS.map(d => d.id)

/** Look up a symbol definition by id. */
export function getSymbolDef(id: string): PointSymbolDef | undefined {
  return POINT_SYMBOL_DEFS.find(d => d.id === id)
}

export interface PointSymbolStyle {
  symbolType: PointSymbolType
  size: number        // pixels, 8–64
  fillColor: string   // hex
  strokeColor: string // hex
  opacity: number     // 0–1
}

export const DEFAULT_POINT_SYMBOL: PointSymbolStyle = {
  symbolType: 'circle',
  size: 16,
  fillColor: '#22D3EE',
  strokeColor: '#ffffff',
  opacity: 0.9,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function drawPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rotation = 0) {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i / sides) - Math.PI / 2 + rotation
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number, innerRatio = 0.45) {
  const ir = r * innerRatio
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / 2) * -1 + (Math.PI / points) * i
    const rad = i % 2 === 0 ? r : ir
    const x = cx + Math.cos(angle) * rad
    const y = cy + Math.sin(angle) * rad
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawPinShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tipY: number) {
  const pinR = r * 0.7
  const startAngle = Math.asin(pinR * 0.6 / pinR)
  ctx.beginPath()
  ctx.arc(cx, cy, pinR, Math.PI - startAngle, startAngle)
  ctx.lineTo(cx, tipY)
  ctx.closePath()
}

// ── Main drawing ────────────────────────────────────────────────────────────

/** Draw a symbol onto a canvas and return it. */
export function createPointSymbolCanvas(style: PointSymbolStyle): HTMLCanvasElement {
  const def = getSymbolDef(style.symbolType)

  // Emoji symbols: render text
  if (def?.emoji) {
    return drawEmojiSymbol(style, def.emoji)
  }

  const needsTail = ['pin', 'pin-outline', 'pin-dot', 'pushpin', 'flag', 'marker', 'beacon'].includes(style.symbolType)
  const pad = 4
  const full = style.size + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = full
  canvas.height = needsTail ? full + style.size * 0.5 : full
  const ctx = canvas.getContext('2d')!

  ctx.globalAlpha = style.opacity
  ctx.fillStyle = style.fillColor
  ctx.strokeStyle = style.strokeColor
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const cx = full / 2
  const cy = full / 2
  const r = style.size / 2

  switch (style.symbolType) {
    // ── SHAPES ────────────────────────────────────────────────────────────────

    case 'circle':
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break

    case 'square':
      roundRect(ctx, cx - r, cy - r, style.size, style.size, 3)
      ctx.fill()
      ctx.stroke()
      break

    case 'diamond': {
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'triangle-up':
    case 'triangle': {
      const h = r * Math.sqrt(3)
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + h / 2, cy + r * 0.5)
      ctx.lineTo(cx - h / 2, cy + r * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'triangle-down': {
      const h = r * Math.sqrt(3)
      ctx.beginPath()
      ctx.moveTo(cx, cy + r)
      ctx.lineTo(cx + h / 2, cy - r * 0.5)
      ctx.lineTo(cx - h / 2, cy - r * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'pentagon':
      drawPolygon(ctx, cx, cy, r, 5)
      ctx.fill()
      ctx.stroke()
      break

    case 'hexagon':
      drawPolygon(ctx, cx, cy, r, 6)
      ctx.fill()
      ctx.stroke()
      break

    case 'octagon':
      drawPolygon(ctx, cx, cy, r, 8)
      ctx.fill()
      ctx.stroke()
      break

    case 'star-4':
      drawStar(ctx, cx, cy, r, 4, 0.4)
      ctx.fill()
      ctx.stroke()
      break

    case 'star-5':
    case 'star':
      drawStar(ctx, cx, cy, r, 5, 0.45)
      ctx.fill()
      ctx.stroke()
      break

    case 'star-6':
      drawStar(ctx, cx, cy, r, 6, 0.5)
      ctx.fill()
      ctx.stroke()
      break

    case 'cross': {
      const arm = r * 0.3
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy - r)
      ctx.lineTo(cx + arm, cy - r)
      ctx.lineTo(cx + arm, cy - arm)
      ctx.lineTo(cx + r, cy - arm)
      ctx.lineTo(cx + r, cy + arm)
      ctx.lineTo(cx + arm, cy + arm)
      ctx.lineTo(cx + arm, cy + r)
      ctx.lineTo(cx - arm, cy + r)
      ctx.lineTo(cx - arm, cy + arm)
      ctx.lineTo(cx - r, cy + arm)
      ctx.lineTo(cx - r, cy - arm)
      ctx.lineTo(cx - arm, cy - arm)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'x-mark': {
      const arm = r * 0.25
      const d = r * 0.85
      ctx.beginPath()
      ctx.moveTo(cx, cy - arm)
      ctx.lineTo(cx + d - arm, cy - d)
      ctx.lineTo(cx + d, cy - d + arm)
      ctx.lineTo(cx + arm, cy)
      ctx.lineTo(cx + d, cy + d - arm)
      ctx.lineTo(cx + d - arm, cy + d)
      ctx.lineTo(cx, cy + arm)
      ctx.lineTo(cx - d + arm, cy + d)
      ctx.lineTo(cx - d, cy + d - arm)
      ctx.lineTo(cx - arm, cy)
      ctx.lineTo(cx - d, cy - d + arm)
      ctx.lineTo(cx - d + arm, cy - d)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'arrow-up': {
      const hw = r * 0.7
      const shaft = r * 0.3
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + hw, cy)
      ctx.lineTo(cx + shaft, cy)
      ctx.lineTo(cx + shaft, cy + r)
      ctx.lineTo(cx - shaft, cy + r)
      ctx.lineTo(cx - shaft, cy)
      ctx.lineTo(cx - hw, cy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'arrow-right': {
      const hw = r * 0.7
      const shaft = r * 0.3
      ctx.beginPath()
      ctx.moveTo(cx + r, cy)
      ctx.lineTo(cx, cy + hw)
      ctx.lineTo(cx, cy + shaft)
      ctx.lineTo(cx - r, cy + shaft)
      ctx.lineTo(cx - r, cy - shaft)
      ctx.lineTo(cx, cy - shaft)
      ctx.lineTo(cx, cy - hw)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'donut': {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Punch hole
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // Re-stroke inner circle with stroke color
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
      ctx.stroke()
      break
    }

    // ── PINS ──────────────────────────────────────────────────────────────────

    case 'pin': {
      const tipY = cy + r + style.size * 0.4
      drawPinShape(ctx, cx, cy, r, tipY)
      ctx.fill()
      ctx.stroke()
      // Inner dot
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.7 * 0.35, 0, Math.PI * 2)
      ctx.fillStyle = style.strokeColor
      ctx.fill()
      break
    }

    case 'pin-outline': {
      const tipY = cy + r + style.size * 0.4
      drawPinShape(ctx, cx, cy, r, tipY)
      ctx.lineWidth = 2.5
      ctx.stroke()
      break
    }

    case 'pin-dot': {
      const tipY = cy + r + style.size * 0.4
      drawPinShape(ctx, cx, cy, r, tipY)
      ctx.fill()
      ctx.stroke()
      // Larger inner dot
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2)
      ctx.fillStyle = style.strokeColor
      ctx.fill()
      break
    }

    case 'pushpin': {
      // Pin head (circle) + spike
      const headR = r * 0.55
      const tipY = cy + r + style.size * 0.4
      // Spike
      ctx.beginPath()
      ctx.moveTo(cx - headR * 0.2, cy + headR * 0.7)
      ctx.lineTo(cx, tipY)
      ctx.lineTo(cx + headR * 0.2, cy + headR * 0.7)
      ctx.fillStyle = style.strokeColor
      ctx.fill()
      // Head
      ctx.fillStyle = style.fillColor
      ctx.beginPath()
      ctx.arc(cx, cy, headR, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'flag': {
      const poleX = cx - r * 0.3
      const tipY = cy + r + style.size * 0.35
      // Pole
      ctx.beginPath()
      ctx.moveTo(poleX, cy - r)
      ctx.lineTo(poleX, tipY)
      ctx.lineWidth = 2
      ctx.strokeStyle = style.strokeColor
      ctx.stroke()
      // Flag body
      ctx.beginPath()
      ctx.moveTo(poleX, cy - r)
      ctx.lineTo(poleX + r * 1.2, cy - r + r * 0.4)
      ctx.lineTo(poleX, cy - r + r * 0.8)
      ctx.closePath()
      ctx.fillStyle = style.fillColor
      ctx.fill()
      ctx.strokeStyle = style.strokeColor
      ctx.stroke()
      break
    }

    case 'marker': {
      // Rounded bottom marker shape (lollipop)
      const tipY = cy + r + style.size * 0.35
      const headR = r * 0.6
      // Stick
      ctx.beginPath()
      ctx.moveTo(cx, cy + headR)
      ctx.lineTo(cx, tipY)
      ctx.lineWidth = 2.5
      ctx.stroke()
      // Circle ball
      ctx.beginPath()
      ctx.arc(cx, cy, headR, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
    }

    case 'beacon': {
      const tipY = cy + r + style.size * 0.35
      // Outer rings (decorative)
      ctx.globalAlpha = style.opacity * 0.2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = style.opacity * 0.4
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2)
      ctx.fill()
      // Core dot
      ctx.globalAlpha = style.opacity
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Spike down
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.12, cy + r * 0.35)
      ctx.lineTo(cx, tipY)
      ctx.lineTo(cx + r * 0.12, cy + r * 0.35)
      ctx.fill()
      break
    }

    default:
      // Fallback: circle
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      break
  }

  return canvas
}

/** Draw an emoji symbol onto a canvas. */
function drawEmojiSymbol(style: PointSymbolStyle, emoji: string): HTMLCanvasElement {
  const pad = 4
  const full = style.size + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = full
  canvas.height = full
  const ctx = canvas.getContext('2d')!

  ctx.globalAlpha = style.opacity
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${style.size}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
  ctx.fillText(emoji, full / 2, full / 2)

  return canvas
}

/** Create a data URL from a symbol style. */
export function pointSymbolToDataUrl(style: PointSymbolStyle): string {
  return createPointSymbolCanvas(style).toDataURL('image/png')
}
