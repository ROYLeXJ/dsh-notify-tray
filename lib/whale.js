/**
 * The whale: the plugin's one icon, drawn from code on every platform.
 *
 * A chibi whale in a maid cap (DeepSeek's mascot, reduced to a silhouette
 * that still reads at 18 px): plump body facing left, flukes raised at the
 * right, a cut-out eye, a scalloped cap with a cut-out band, and a tiny fin.
 * State variants add a floating glyph instead of changing the colour, so the
 * icon works as a monochrome macOS template image and as a tinted bitmap on
 * Windows / Linux alike:
 *
 *   idle       the whale
 *   running    the whale spouting (two animation frames)
 *   attention  the whale + "!"
 *   error      the whale + "×"
 *
 * Geometry lives in a 0..100 box, y down. Paths use nonzero winding:
 * clockwise subpaths add, counter-clockwise subpaths cut holes.
 */

export const BOX = 100
/** Tight bounds of every variant inside the box (helpers crop to this). */
export const BOUNDS = { x: 0, y: 0, w: 100, h: 86 }

/** Tint used where the icon is a coloured bitmap (Windows / Linux / SVG). */
export const STATE_RGB = {
  idle: [59, 83, 170],       // deep dress blue
  running: [77, 107, 254],   // DeepSeek blue
  attention: [245, 158, 11], // amber
  error: [224, 49, 49],      // red
}

const K = 0.5523 // cubic approximation of a quarter circle

/** Circle as four cubics. Clockwise (y down) adds; ccw cuts. */
function circle(cx, cy, r, { hole = false } = {}) {
  const k = K * r
  const cw = [
    ['M', cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['Z'],
  ]
  return hole ? reverse(cw) : cw
}

/** Ellipse (axis-aligned) as four cubics, clockwise. */
function ellipse(cx, cy, rx, ry) {
  const kx = K * rx
  const ky = K * ry
  return [
    ['M', cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['Z'],
  ]
}

/** Rounded rectangle centred at (cx, cy), rotated by `deg`, clockwise. */
function pill(cx, cy, w, h, r, deg = 0) {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const t = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos]
  const hw = w / 2
  const hh = h / 2
  const k = K * r
  const seg = (...pts) => pts.flatMap(([x, y]) => t(x, y))
  return [
    ['M', ...t(-hw + r, -hh)],
    ['L', ...t(hw - r, -hh)],
    ['C', ...seg([hw - r + k, -hh], [hw, -hh + r - k], [hw, -hh + r])],
    ['L', ...t(hw, hh - r)],
    ['C', ...seg([hw, hh - r + k], [hw - r + k, hh], [hw - r, hh])],
    ['L', ...t(-hw + r, hh)],
    ['C', ...seg([-hw + r - k, hh], [-hw, hh - r + k], [-hw, hh - r])],
    ['L', ...t(-hw, -hh + r)],
    ['C', ...seg([-hw, -hh + r - k], [-hw + r - k, -hh], [-hw + r, -hh])],
    ['Z'],
  ]
}

/** Reverse a closed subpath's direction (turns an additive shape into a hole). */
function reverse(sub) {
  const pts = []
  let cur
  for (const cmd of sub) {
    if (cmd[0] === 'M') cur = [cmd[1], cmd[2]]
    else if (cmd[0] === 'L') { pts.push({ from: cur, to: [cmd[1], cmd[2]] }); cur = [cmd[1], cmd[2]] }
    else if (cmd[0] === 'C') {
      pts.push({ from: cur, c1: [cmd[1], cmd[2]], c2: [cmd[3], cmd[4]], to: [cmd[5], cmd[6]] })
      cur = [cmd[5], cmd[6]]
    }
  }
  const out = [['M', ...pts[pts.length - 1].to]]
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const s = pts[i]
    if (s.c1) out.push(['C', ...s.c2, ...s.c1, ...s.from])
    else out.push(['L', ...s.from])
  }
  out.push(['Z'])
  return out
}

// ---- the whale ------------------------------------------------------------

/** Body + raised flukes, one clockwise outline. Faces left. */
const BODY = [
  ['M', 4, 54],
  ['C', 4, 36, 20, 22, 42, 22],          // forehead up to the crown
  ['C', 56, 22, 68, 28, 72, 38],         // back sloping down to the tail root
  ['C', 73, 28, 74, 14, 79, 5],          // tail stem rising to the left fluke tip
  ['C', 87, 7, 90, 15, 90, 24],          // down into the notch between the flukes
  ['C', 93, 14, 97, 9, 100, 9],          // up to the right fluke tip
  ['C', 101, 22, 95, 36, 87, 43],        // down the right fluke to the stem
  ['C', 83, 47, 77, 49, 72, 50],         // stem back into the body
  ['C', 68, 70, 58, 80, 42, 80],         // belly
  ['C', 24, 80, 4, 72, 4, 54],           // chin back to the face
  ['Z'],
]

/** Pectoral fin, drawn over the belly (nonzero union). */
const FIN = [
  ['M', 30, 72],
  ['C', 28, 78, 22, 84, 14, 84],
  ['C', 18, 76, 24, 70, 32, 68],
  ['Z'],
]

/** Maid cap: a row of small frills hugging the crown... */
const CAP_FRILLS = [
  circle(27, 29.5, 3.6),
  circle(34, 25.5, 3.8),
  circle(42, 23, 4),
  circle(50, 23.2, 3.8),
  circle(58, 25.5, 3.6),
]

/** ...and the cap's ribbon cut out just below them. */
const CAP_BAND = reverse([
  ['M', 20, 36],
  ['C', 28, 30, 46, 26.5, 62, 29.5],
  ['L', 62, 32.5],
  ['C', 46, 29.5, 30, 33, 21.5, 38.5],
  ['Z'],
])

const EYE = circle(23, 50, 4.6, { hole: true })

/** Spout frames: a jet with two drops, rising from the blowhole behind the cap. */
const SPOUT = [
  [pill(65, 17, 4.2, 12, 2.1), ellipse(56, 10, 2.8, 3.4), ellipse(73, 9, 2.6, 3.2)],
  [pill(65, 13, 4.2, 18, 2.1), ellipse(55, 5, 2.8, 3.4), ellipse(73, 3.5, 2.6, 3.2)],
]

/** "!" / "×" float in front of the face, like a speech bubble. */
const BANG = [pill(9, 12, 7, 15, 3.5), circle(9, 26.5, 3.6)]
const CROSS = [pill(11, 15, 19, 6.5, 3.2, 45), pill(11, 15, 19, 6.5, 3.2, -45)]

const BASE = [BODY, FIN, ...CAP_FRILLS, CAP_BAND, EYE]

/**
 * @param {'idle'|'running'|'attention'|'error'} state
 * @returns {Array<Array<any>>} subpaths for frame 0; `frames()` for animation.
 */
export function whalePaths(state, frame = 0) {
  if (state === 'running') return [...BASE, ...SPOUT[frame % SPOUT.length]]
  if (state === 'attention') return [...BASE, ...BANG]
  if (state === 'error') return [...BASE, ...CROSS]
  return BASE
}

/** Animation frames for a state (one frame unless it animates). */
export function whaleFrames(state) {
  const count = state === 'running' ? SPOUT.length : 1
  return Array.from({ length: count }, (_, i) => whalePaths(state, i))
}

/** Everything a helper needs to draw every state, sent once in view.json. */
export function iconSpec() {
  return {
    box: BOX,
    bounds: BOUNDS,
    rgb: STATE_RGB,
    frames: Object.fromEntries(['idle', 'running', 'attention', 'error'].map(s => [s, whaleFrames(s)])),
  }
}

// ---- exporters --------------------------------------------------------------

const num = v => Number(v.toFixed(2))

export function toSvgPath(paths) {
  return paths.map(sub => sub.map(cmd => `${cmd[0]}${cmd.slice(1).map(num).join(' ')}`).join(' ')).join(' ')
}

/**
 * Standalone SVG of one state. `fill` defaults to the state tint;
 * `background` adds a rounded tile (used for the plugin icon).
 */
export function whaleSvg({ state = 'idle', frame = 0, size = 64, fill, background, padding = 0 } = {}) {
  const [r, g, b] = STATE_RGB[state] ?? STATE_RGB.idle
  const color = fill ?? `rgb(${r},${g},${b})`
  const inner = BOX - padding * 2
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" width="${size}" height="${size}">`]
  if (background) parts.push(`<rect width="${BOX}" height="${BOX}" rx="22" fill="${background}"/>`)
  const transform = padding ? ` transform="translate(${padding} ${padding}) scale(${inner / BOX})"` : ''
  parts.push(`<path d="${toSvgPath(whalePaths(state, frame))}" fill="${color}" fill-rule="nonzero"${transform}/>`)
  parts.push('</svg>')
  return parts.join('')
}

/** Flatten cubics into closed polygons (for the Linux software rasterizer). */
export function flatten(paths, steps = 10) {
  const polys = []
  for (const sub of paths) {
    let poly = []
    let cur = [0, 0]
    for (const cmd of sub) {
      if (cmd[0] === 'M') { cur = [cmd[1], cmd[2]]; poly = [cur] }
      else if (cmd[0] === 'L') { cur = [cmd[1], cmd[2]]; poly.push(cur) }
      else if (cmd[0] === 'C') {
        const [x0, y0] = cur
        const [, x1, y1, x2, y2, x3, y3] = cmd
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps
          const u = 1 - t
          poly.push([
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ])
        }
        cur = [x3, y3]
      } else if (cmd[0] === 'Z') { if (poly.length > 2) polys.push(poly); poly = [] }
    }
    if (poly.length > 2) polys.push(poly)
  }
  return polys
}
