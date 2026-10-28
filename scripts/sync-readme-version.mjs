// Rewrites every `dsh-notify-tray@<version>` in the READMEs to package.json's
// version. Runs from `npm version` (see package.json), so a release bump also
// updates the install commands.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

for (const name of ['README.md', 'README.zh-CN.md']) {
  const file = join(root, name)
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/dsh-notify-tray@\d+\.\d+\.\d+(?:-[\w.]+)?/gu, `dsh-notify-tray@${version}`)
  if (next !== text) writeFileSync(file, next)
}
