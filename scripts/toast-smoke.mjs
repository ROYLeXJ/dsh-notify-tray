// Windows check for per-session toasts: a second toast for the same session
// replaces the first, and a withdrawn one leaves Notification Center.
// Needs only Node (no DSH): `node scripts/toast-smoke.mjs`. After each step
// it counts this plugin's toasts still in Notification Center and prints
// PASS / FAIL; watch the bottom-right corner too.
import { spawnSync } from 'node:child_process'
import { systemNotify, systemWithdraw, toastTag } from '../lib/system.js'

if (process.platform !== 'win32') {
  console.log('这个脚本只在 Windows 上运行。')
  process.exit(0)
}

const AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
const KEY = 'toast-smoke'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Tags of this plugin's toasts currently in Notification Center. */
function shownTags() {
  const script = [
    '$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
    `[Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('${AUMID}') | Where-Object { $_.Group -eq 'dsh-notify-tray' } | ForEach-Object { $_.Tag }`,
  ].join('; ')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', windowsHide: true })
  if (out.status !== 0) return { error: (out.stderr || '').trim() }
  return { tags: out.stdout.split(/\r?\n/u).map(s => s.trim()).filter(Boolean) }
}

let failed = 0
function check(step, expected) {
  const { tags, error } = shownTags()
  if (error) {
    console.log(`  ? 读不到通知中心：${error}`)
    return
  }
  const mine = tags.filter(tag => tag === toastTag(KEY)).length
  const ok = mine === expected
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${step}：通知中心里这个会话的通知有 ${mine} 条（应为 ${expected}）`)
}

const send = (title, body) => systemNotify({ title, body, key: KEY, sessionId: KEY, sound: false })

console.log('1/3 发第一条通知「测试 1」')
console.log(`  发送结果：${await send('🐳 测试 1', '这是第一条')}`)
await sleep(3000)
check('第一条', 1)

console.log('2/3 同一会话再发「测试 2」，应替换掉第一条')
console.log(`  发送结果：${await send('🐳 测试 2', '应该替换掉第一条')}`)
await sleep(3000)
check('替换', 1)

console.log('3/3 收回这条通知')
console.log(`  收回结果：${await systemWithdraw(KEY)}`)
await sleep(2000)
check('收回', 0)

console.log(failed ? `\n有 ${failed} 项没通过，把上面的输出发给我。` : '\n全部通过。')
process.exit(failed ? 1 : 0)
