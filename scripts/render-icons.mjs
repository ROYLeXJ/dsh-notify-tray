// Regenerate the SVG artwork from lib/whale.js:
//   icon.svg              plugin icon (whale on a DeepSeek-blue tile)
//   assets/preview.svg    every state side by side, for the README
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOUNDS, STATE_RGB, toSvgPath, whalePaths, whaleSvg } from '../lib/whale.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Plugin icon: white whale on the brand tile, with the cap band showing the tile colour.
writeFileSync(join(root, 'icon.svg'), whaleSvg({ state: 'idle', size: 64, fill: '#fff', background: '#4D6BFE', padding: 12 }))

// README preview: the four states (running shows frame 0) with their tints.
const states = [['idle', '空闲'], ['running', '运行中'], ['attention', '等你处理'], ['error', '刚失败']]
const cell = 120
let x = 0
let body = ''
for (const [state, label] of states) {
  const [r, g, b] = STATE_RGB[state]
  body += `<g transform="translate(${x + 10} ${10 + (100 - BOUNDS.h) / 2})"><path d="${toSvgPath(whalePaths(state))}" fill="rgb(${r},${g},${b})"/></g>`
  body += `<text x="${x + 60}" y="112" text-anchor="middle" font-family="-apple-system, PingFang SC, Microsoft YaHei, sans-serif" font-size="12" fill="#555">${label}</text>`
  x += cell
}
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * states.length}" height="124" viewBox="0 0 ${cell * states.length} 124"><rect width="100%" height="100%" rx="12" fill="#f5f6fa"/>${body}</svg>`
writeFileSync(join(root, 'assets', 'preview.svg'), preview)
console.log(`icon.svg + assets/preview.svg written (bounds ${BOUNDS.w}×${BOUNDS.h})`)
