/**
 * Software rasterizer for the Linux tray icon: the whale from lib/whale.js
 * filled with the state colour, emitted as StatusNotifierItem IconPixmap data
 * (ARGB32, network byte order), plus RGBA / PNG for the notification icon.
 * No image libraries needed.
 *
 * Polygons are the flattened bezier outlines, filled by scanline with the
 * nonzero winding rule at 4×4 supersampling, so the eye and cap band holes
 * come out and edges stay smooth. It runs on the host's main thread, so it
 * has to be quick: a 48 px frame takes about a millisecond.
 */
import { deflateSync } from 'node:zlib'
import { BOUNDS, STATE_RGB, flatten, whalePaths } from './whale.js'

export { STATE_RGB }

const SS = 4

/**
 * @param {number} size - square edge in pixels.
 * @param {string} state - idle | running | attention | error | done.
 * @param {number} [frame] - animation frame for states that animate.
 * @returns {Buffer} ARGB32 pixels, row-major.
 */
export function renderIcon(size, state, frame = 0) {
  const [r, g, b] = STATE_RGB[state] ?? STATE_RGB.idle
  const polys = flatten(whalePaths(STATE_RGB[state] ? state : 'idle', frame), 8)
  // Fit the whale's bounds into the square, centred; work in subsample units.
  const scale = Math.min(size / BOUNDS.w, size / BOUNDS.h)
  const ox = (size - BOUNDS.w * scale) / 2
  const oy = (size - BOUNDS.h * scale) / 2
  const edges = [] // x0, y0, x1, y1, direction — horizontal edges dropped
  for (const poly of polys) {
    for (let i = 0, n = poly.length; i < n; i += 1) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[(i + 1) % n]
      const y0 = (oy + (ay - BOUNDS.y) * scale) * SS
      const y1 = (oy + (by - BOUNDS.y) * scale) * SS
      if (y0 === y1) continue
      edges.push((ox + (ax - BOUNDS.x) * scale) * SS, y0, (ox + (bx - BOUNDS.x) * scale) * SS, y1, y1 > y0 ? 1 : -1)
    }
  }

  const cover = new Uint16Array(size * size)
  const rows = size * SS
  const xs = []
  const dirs = []
  const order = []
  for (let sy = 0; sy < rows; sy += 1) {
    const y = sy + 0.5
    xs.length = 0
    dirs.length = 0
    for (let e = 0; e < edges.length; e += 5) {
      const y0 = edges[e + 1]
      const y1 = edges[e + 3]
      // Half-open rule: an edge crosses the scanline when exactly one endpoint is above it.
      if ((y0 <= y) === (y1 <= y)) continue
      xs.push(edges[e] + ((y - y0) * (edges[e + 2] - edges[e])) / (y1 - y0))
      dirs.push(edges[e + 4])
    }
    if (xs.length < 2) continue
    order.length = xs.length
    for (let i = 0; i < xs.length; i += 1) order[i] = i
    order.sort((p, q) => xs[p] - xs[q])
    const row = (sy / SS) | 0
    let wind = 0
    for (let i = 0; i < order.length - 1; i += 1) {
      wind += dirs[order[i]]
      if (wind === 0) continue
      // Subsample columns whose centre (sx + 0.5) lies inside [xa, xb).
      const from = Math.max(0, Math.ceil(xs[order[i]] - 0.5))
      const to = Math.min(rows, Math.ceil(xs[order[i + 1]] - 0.5))
      for (let sx = from; sx < to; sx += 1) cover[row * size + ((sx / SS) | 0)] += 1
    }
  }

  const out = Buffer.alloc(size * size * 4)
  for (let p = 0; p < size * size; p += 1) {
    out[p * 4] = Math.round((cover[p] / (SS * SS)) * 255)
    out[p * 4 + 1] = r
    out[p * 4 + 2] = g
    out[p * 4 + 3] = b
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

/** RGBA pixels (straight alpha, row-major), the layout freedesktop's `image-data` hint wants. */
export function rgbaIcon(size, state, frame = 0) {
  const argb = renderIcon(size, state, frame)
  const out = Buffer.alloc(argb.length)
  for (let p = 0; p < argb.length; p += 4) {
    out[p] = argb[p + 1]
    out[p + 1] = argb[p + 2]
    out[p + 2] = argb[p + 3]
    out[p + 3] = argb[p]
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** The whale as a PNG file's bytes (for notification servers that only take an icon path). */
export function pngIcon(size, state, frame = 0) {
  const rgba = rgbaIcon(size, state, frame)
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
