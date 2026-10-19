/**
 * Tiny software rasterizer for the Linux tray icon: a colored disc with an
 * optional white glyph (digit or "!"), emitted as StatusNotifierItem
 * IconPixmap data (ARGB32, network byte order). No image libraries needed.
 */

export const STATE_RGB = {
  attention: [245, 140, 30],
  error: [224, 49, 49],
  running: [77, 107, 254],
  idle: [46, 160, 90],
}

// 3x5 bitmap glyphs, one string per row ('1' = ink).
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '!': ['010', '010', '010', '000', '010'],
  '.': ['000', '000', '010', '000', '000'],
}

/**
 * @param {number} size - square edge in pixels.
 * @param {string} state - key of STATE_RGB.
 * @param {string} glyph - '' / one character from GLYPHS.
 * @returns {Buffer} ARGB32 pixels, row-major.
 */
export function renderIcon(size, state, glyph) {
  const [r, g, b] = STATE_RGB[state] ?? STATE_RGB.idle
  const out = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const radius = size / 2
  const shape = GLYPHS[glyph] ?? (glyph === '' ? GLYPHS['.'] : undefined)
  // Glyph cell: 3x5 grid scaled to ~55% of the icon height.
  const cell = Math.max(1, Math.floor((size * 0.55) / 5))
  const gw = 3 * cell
  const gh = 5 * cell
  const gx = Math.round((size - gw) / 2)
  const gy = Math.round((size - gh) / 2)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // 4x4 supersampling for a smooth disc edge.
      let cover = 0
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          const dx = x + (sx + 0.5) / 4 - 0.5 - c
          const dy = y + (sy + 0.5) / 4 - 0.5 - c
          if (dx * dx + dy * dy <= radius * radius) cover += 1
        }
      }
      const alpha = Math.round((cover / 16) * 255)
      let ink = false
      if (shape && x >= gx && x < gx + gw && y >= gy && y < gy + gh) {
        ink = shape[Math.floor((y - gy) / cell)][Math.floor((x - gx) / cell)] === '1'
      }
      const i = (y * size + x) * 4
      out[i] = alpha
      out[i + 1] = ink ? 255 : r
      out[i + 2] = ink ? 255 : g
      out[i + 3] = ink ? 255 : b
    }
  }
  return out
}

/** Glyph for a view: badge digit, '!' on error, '' otherwise. */
export function glyphOf(view) {
  if (view.badge) return view.badge
  return view.state === 'error' ? '!' : ''
}
