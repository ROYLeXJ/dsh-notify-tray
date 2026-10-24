/**
 * The whale: the plugin's one icon, drawn from code on every platform.
 *
 * It is the DeepSeek Harness whale: a whale curled into a ring, nose to the
 * right, tail sweeping up behind its head, a small dorsal fin on the back,
 * the white sweep of its belly line and a comma-shaped eye cut out of the
 * body. The outline was traced by hand from the app icon's silhouette and
 * smoothed into cubic curves; no bitmap is involved anywhere.
 *
 * State variants add a floating glyph in front of the nose instead of
 * changing the colour, so the icon works as a monochrome macOS template image
 * and as a tinted bitmap on Windows / Linux alike:
 *
 *   idle       the whale
 *   running    the whale blowing bubbles (two animation frames)
 *   attention  the whale + "!"
 *   error      the whale + "×"
 *
 * Geometry lives in a 100-wide box, y down. Paths use nonzero winding:
 * clockwise subpaths add, counter-clockwise subpaths cut holes.
 */

export const BOX = 100
/** Tight bounds of every variant inside the box (helpers crop to this). */
export const BOUNDS = { x: 0, y: 0, w: 100, h: 74 }

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

/** The icon's silhouette is 0.735 as tall as it is wide; points below are traced in percent of each. */
const ASPECT = 0.735

/**
 * Closed Catmull-Rom spline through traced points → cubic bezier commands.
 * A point written as [x, y, 1] is a corner (no smoothing through it).
 */
function spline(points, { hole = false } = {}) {
  const pts = points.map(([x, y, corner]) => [x, y * ASPECT, corner === 1])
  const n = pts.length
  const out = [['M', pts[0][0], pts[0][1]]]
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = p1[2] ? [p1[0], p1[1]] : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = p2[2] ? [p2[0], p2[1]] : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    out.push(['C', c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]])
  }
  out.push(['Z'])
  return hole ? reverse(out) : out
}

/**
 * Outer silhouette, clockwise: back, dorsal fin, forehead, nose, face, chin,
 * then up the belly-line sweep (which opens out at the mouth corner, so it is
 * a deep bay rather than a hole), round the pectoral fin, and back along the
 * tail stock round the ring.
 */
const BODY = spline([
  [22, 7], [31, 5.5], [43, 5], [49, 2, 1], [53, 4.5, 1],     // back up to the little dorsal fin
  [51, 8], [50, 12], [52, 16], [56, 20], [61, 26],           // the fin's trailing notch, then the head rises
  [65, 32], [70, 37], [77, 38.5], [84, 41, 1],               // forehead to the nose
  [84, 47], [82, 56], [79, 64], [75, 72], [72, 79],          // down the face
  [73, 84], [78, 87], [79, 90.5], [75, 93], [66, 93, 1],     // chin and the jaw's underside
  [62, 89.5], [58, 84], [53.5, 78], [49, 71], [45, 64],      // up the sweep's right side (the belly band)
  [41, 57], [36, 50], [29, 43], [19, 37], [8.5, 34.5, 1],    // to the sweep's tip
  [6.5, 40], [7, 46], [8, 52], [9, 58], [11, 64],            // down its left side (inside the ring)
  [14, 70], [18, 76], [23, 82], [28, 85.5], [32, 87.5, 1],   // to the pectoral fin
  [33, 81], [33, 74.5, 1], [39, 74.5, 1], [44, 80], [48, 85.5], // the fin
  [51, 89, 1], [56, 91], [61, 93.5, 1],                      // along the tail stock to the mouth corner
  [56, 96], [49, 98.5], [40, 99.5], [28, 97],                // the ring's underside
  [18, 92], [11, 84], [5, 73], [1.5, 60], [0.5, 46],         // round the left of the ring
  [2, 32], [7, 19], [14, 11],                                // and back up to the back
])

/** Comma-shaped eye (hole) with its pupil (added back). */
const EYE = spline([
  [52, 39, 1], [57, 41.5], [62, 45], [66, 50], [67, 55], [64.5, 59.5], [61, 60.5], [58.5, 57], [56, 51], [53.5, 45],
], { hole: true })
const PUPIL = circle(55.2, 47.5 * ASPECT, 2.2)

/** Tail flukes, sweeping up behind the head. Overlaps the forehead (nonzero union). */
const TAIL = spline([
  [70, 1, 1], [73, 5], [76, 10], [79, 14], [82.5, 17, 1],  // left fluke's inner edge down to the notch
  [87, 14], [93, 11], [100, 10, 1],                         // right fluke out to its tip
  [99, 19], [97, 25], [93, 30], [87, 34], [84, 38],         // its trailing edge down into the head
  [80, 45], [74, 45], [74, 38], [74, 31],                   // inside the head, back up the stem
  [71, 26], [68, 20], [67, 12], [68, 5],                    // the left fluke's leading edge
])

const Y = y => y * ASPECT

/** Bubbles in front of the nose (two frames: rising). */
const BUBBLES = [
  [circle(90, Y(62), 2.2), circle(95, Y(52), 3), circle(91, Y(42), 1.6)],
  [circle(90, Y(56), 2.2), circle(95.5, Y(45), 3), circle(91, Y(35), 1.6)],
]

/** "!" / "×" in front of the nose. */
const BANG = [pill(93, Y(52), 6, 12 * ASPECT, 3), circle(93, Y(67), 3)]
const CROSS = [pill(93, Y(58), 15, 5.5, 2.7, 45), pill(93, Y(58), 15, 5.5, 2.7, -45)]

const BASE = [BODY, EYE, PUPIL, TAIL]

/**
 * @param {'idle'|'running'|'attention'|'error'} state
 * @returns {Array<Array<any>>} subpaths for frame 0; `frames()` for animation.
 */
export function whalePaths(state, frame = 0) {
  if (state === 'running') return [...BASE, ...BUBBLES[frame % BUBBLES.length]]
  if (state === 'attention') return [...BASE, ...BANG]
  if (state === 'error') return [...BASE, ...CROSS]
  return BASE
}

/** Animation frames for a state (one frame unless it animates). */
export function whaleFrames(state) {
  const count = state === 'running' ? BUBBLES.length : 1
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
 * Standalone SVG of one state, cropped to BOUNDS. `fill` defaults to the
 * state tint; `background` adds a rounded tile the whale is centred on
 * (used for the plugin icon), with `padding` box units around it.
 */
export function whaleSvg({ state = 'idle', frame = 0, size = 64, fill, background, padding = 0 } = {}) {
  const [r, g, b] = STATE_RGB[state] ?? STATE_RGB.idle
  const color = fill ?? `rgb(${r},${g},${b})`
  const d = toSvgPath(whalePaths(state, frame))
  if (!background) {
    const height = Math.round(size * (BOUNDS.h / BOUNDS.w))
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}" width="${size}" height="${height}">`
      + `<path d="${d}" fill="${color}" fill-rule="nonzero"/></svg>`
  }
  const tile = BOX
  const inner = tile - padding * 2
  const scale = Math.min(inner / BOUNDS.w, inner / BOUNDS.h)
  const tx = (tile - BOUNDS.w * scale) / 2 - BOUNDS.x * scale
  const ty = (tile - BOUNDS.h * scale) / 2 - BOUNDS.y * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile} ${tile}" width="${size}" height="${size}">`
    + `<rect width="${tile}" height="${tile}" rx="22" fill="${background}"/>`
    + `<path d="${d}" fill="${color}" fill-rule="nonzero" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})"/></svg>`
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
