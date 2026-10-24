/**
 * Software rasterizer for the Linux tray icon: the whale from lib/whale.js
 * filled with the state colour, emitted as StatusNotifierItem IconPixmap data
 * (ARGB32, network byte order). No image libraries needed.
 *
 * Polygons are the flattened bezier outlines; nonzero winding with 4×4
 * supersampling, so the eye and cap band holes come out and edges stay smooth.
 */
import { BOUNDS, BOX, STATE_RGB, flatten, whalePaths } from './whale.js'

export { STATE_RGB }

const SS = 4

/** Winding number of point (x, y) against every polygon. */
function winding(polys, x, y) {
  let w = 0
  for (const poly of polys) {
    for (let i = 0, n = poly.length; i < n; i += 1) {
      const [x0, y0] = poly[i]
      const [x1, y1] = poly[(i + 1) % n]
      if (y0 <= y) {
        if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) w += 1
      } else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) w -= 1
    }
  }
  return w
}

/**
 * @param {number} size - square edge in pixels.
 * @param {string} state - idle | running | attention | error.
 * @param {number} [frame] - animation frame for states that animate.
 * @returns {Buffer} ARGB32 pixels, row-major.
 */
export function renderIcon(size, state, frame = 0) {
  const [r, g, b] = STATE_RGB[state] ?? STATE_RGB.idle
  const polys = flatten(whalePaths(STATE_RGB[state] ? state : 'idle', frame), 8)
  const out = Buffer.alloc(size * size * 4)
  // Fit the whale's bounds into the square, centred.
  const scale = Math.min(size / BOUNDS.w, size / BOUNDS.h)
  const ox = (size - BOUNDS.w * scale) / 2
  const oy = (size - BOUNDS.h * scale) / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let cover = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = BOUNDS.x + (x + (sx + 0.5) / SS - ox) / scale
          const py = BOUNDS.y + (y + (sy + 0.5) / SS - oy) / scale
          if (px < 0 || py < 0 || px > BOX || py > BOX) continue
          if (winding(polys, px, py) !== 0) cover += 1
        }
      }
      const i = (y * size + x) * 4
      out[i] = Math.round((cover / (SS * SS)) * 255)
      out[i + 1] = r
      out[i + 2] = g
      out[i + 3] = b
    }
  }
  return out
}

/** Quick ASCII dump for tests and eyeballing: '#' where the whale is opaque. */
export function asciiIcon(size, state, frame = 0) {
  const px = renderIcon(size, state, frame)
  const rows = []
  for (let y = 0; y < size; y += 1) {
    let row = ''
    for (let x = 0; x < size; x += 1) {
      const a = px[(y * size + x) * 4]
      row += a > 160 ? '#' : a > 60 ? '+' : ' '
    }
    rows.push(row)
  }
  return rows.join('\n')
}
