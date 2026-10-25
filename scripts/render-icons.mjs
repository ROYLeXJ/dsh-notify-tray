// Regenerate the SVG artwork from lib/whale.js:
//   icon.svg              plugin icon (whale on a DeepSeek-blue tile)
//   assets/preview.svg    every state side by side, for the README
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOUNDS, STATE_RGB, toSvgPath, whaleFrames, whalePaths, whaleSvg } from '../lib/whale.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Plugin icon: the whale on a sea-blue gradient tile, with sparkles and a
// couple of bubbles so it reads as "cute mascot" rather than "system icon".
/** Four-point sparkle (✦) centred at (cx, cy) with outer radius r. */
function sparkle(cx, cy, r) {
  const k = r * 0.22 // waist: how pinched the star is
  return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z`
}
const whale = toSvgPath(whalePaths('idle'))
const scale = 0.72
const tx = (100 - BOUNDS.w * scale) / 2
const ty = (100 - BOUNDS.h * scale) / 2 + 3
const icon = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128">',
  '<defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6E8BFF"/><stop offset="1" stop-color="#3550E6"/></linearGradient></defs>',
  '<rect width="100" height="100" rx="22" fill="url(#sea)"/>',
  // bubbles drifting up behind the whale
  '<g fill="#fff" opacity="0.35"><circle cx="18" cy="24" r="3.2"/><circle cx="26" cy="15" r="2"/><circle cx="84" cy="78" r="2.6"/><circle cx="90" cy="70" r="1.6"/></g>',
  // sparkles
  `<g fill="#FFF3A6"><path d="${sparkle(80, 20, 7)}"/><path d="${sparkle(90, 34, 3.6)}"/><path d="${sparkle(14, 74, 4.2)}"/></g>`,
  `<path d="${whale}" fill="#fff" fill-rule="nonzero" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale})"/>`,
  '</svg>',
].join('')
writeFileSync(join(root, 'icon.svg'), icon)

// README preview: the four states (running shows frame 0) with their tints.
const states = [['idle', '空闲'], ['running', '运行中'], ['attention', '等你处理'], ['error', '刚失败'], ['done', '刚完成']]
const cell = 120
let x = 0
let body = ''
for (const [state, label] of states) {
  const [r, g, b] = STATE_RGB[state]
  // Mid-animation frame, so the sheet shows each state's pose.
  const frames = whaleFrames(state)
  body += `<g transform="translate(${x + 10} ${10 + (100 - BOUNDS.h) / 2 - BOUNDS.y})"><path d="${toSvgPath(frames[Math.floor(frames.length * 0.4)])}" fill="rgb(${r},${g},${b})"/></g>`
  body += `<text x="${x + 60}" y="112" text-anchor="middle" font-family="-apple-system, PingFang SC, Microsoft YaHei, sans-serif" font-size="12" fill="#555">${label}</text>`
  x += cell
}
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * states.length}" height="124" viewBox="0 0 ${cell * states.length} 124"><rect width="100%" height="100%" rx="12" fill="#f5f6fa"/>${body}</svg>`
writeFileSync(join(root, 'assets', 'preview.svg'), preview)
console.log(`icon.svg + assets/preview.svg written (bounds ${BOUNDS.w}×${BOUNDS.h})`)
