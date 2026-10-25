// Walk the status-bar whale and the notifications through their states so you
// can see each one without waiting for a real task.
//
//   node scripts/demo.mjs            # a second, demo-only whale appears in the menu bar
//   node scripts/demo.mjs --live     # drive the real whale (DSH must be idle); restored afterwards
//   node scripts/demo.mjs --all      # also show 等你处理 / 失败
//
// States shown, in order: 空闲 → 工作中（冒泡）→ 完成（通知）→ 空闲.
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildView, TITLES } from '../lib/format.js'
import { systemNotify } from '../lib/system.js'
import { startTray } from '../lib/tray/index.js'
import { iconSpec } from '../lib/whale.js'

const args = new Set(process.argv.slice(2))
const live = args.has('--live')
const all = args.has('--all')
const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const realView = join(home, 'storages', 'dsh-notify-tray', 'view.json')
const demoDir = join(home, 'storages', 'dsh-notify-tray', 'demo')
const icon = iconSpec()
const title = '演示任务'
const usage = { tokens: { total: 128_000, output: 3_200 }, balance: 88.8, balanceSpend: 0.42, currency: 'CNY' }
const cfg = { spendSource: 'auto', errorHoldMinutes: 10 }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const say = text => console.log(`\n▶ ${text}`)
const countdown = async seconds => {
  for (let s = seconds; s > 0; s -= 1) {
    process.stdout.write(`\r   ${s} 秒后进入下一步…  `)
    await sleep(1000)
  }
  process.stdout.write('\r                          \r')
}

/** Tracker-shaped summaries for each demo state. */
function tasks(kind, now) {
  const base = { running: 0, runningList: [], waiting: [], recent: [], today: { completed: 0, failed: 0, aborted: 0 } }
  switch (kind) {
    case 'running':
      return { ...base, running: 1, runningList: [{ sessionId: 'demo', title, since: now - 3 * 60_000, tool: 'bash' }] }
    case 'completed':
      return { ...base, today: { ...base.today, completed: 1 }, recent: [{ sessionId: 'demo', title, kind: 'completed', at: now }] }
    case 'attention':
      return {
        ...base, running: 1,
        runningList: [{ sessionId: 'demo', title, since: now - 60_000, tool: 'ask_user_question' }],
        waiting: [{ sessionId: 'demo', title, kind: 'choice', text: '要用哪个方案？', since: now }],
      }
    case 'failed':
      return { ...base, today: { ...base.today, failed: 1 }, recent: [{ sessionId: 'demo', title, kind: 'failed', at: now }] }
    default:
      return base
  }
}

// ---- where the view goes --------------------------------------------------------
let show
let cleanup = async () => {}
if (live) {
  let backup
  try { backup = await readFile(realView) } catch {}
  show = async view => {
    const tmp = `${realView}.demo-tmp`
    await writeFile(tmp, JSON.stringify({ ...view, icon }))
    await rename(tmp, realView)
  }
  cleanup = async () => { if (backup) await writeFile(realView, backup) }
  console.log('驱动真实的状态栏鲸鱼（结束后恢复原状）。如果 DSH 里正有任务在跑，它会把演示盖掉。')
} else {
  await mkdir(demoDir, { recursive: true })
  const tray = await startTray({ stateDir: demoDir, onAction: id => console.log(`   （菜单点击：${id}）`), logger: console })
  show = view => tray.update({ ...view, icon })
  cleanup = () => tray.stop()
  console.log('菜单栏里会多出一只演示用的鲸鱼（结束后消失）。macOS 26 放不下时会把它收进「«」里。')
}

const view = (kind, now = Date.now()) => buildView(tasks(kind, now), usage, cfg, now)
const notify = async (type, body) => {
  say(`通知：${TITLES[type]} · ${title}`)
  await systemNotify({ title: `${TITLES[type]} · ${title}`, body, sound: true })
}

try {
  say('① 空闲：鲸鱼安静待着，旁边没有文字；菜单第一行「空闲，等你派活」')
  await show(view('idle'))
  await countdown(5)

  say('② 工作中：鲸鱼鼻子前冒泡泡（两帧动画），旁边「运行中 1」；菜单里是「演示任务 · 3 分钟 · bash」')
  await show(view('running'))
  await countdown(8)

  say('③ 工作完成：弹出通知，鲸鱼回到安静状态；菜单第一行「空闲 · 今日已完成 1 个任务」，「最近结束」里有这条')
  await show(view('completed'))
  await notify('completed', '任务已完成')
  await countdown(8)

  if (all) {
    say('④ 等你处理：鼻子前一个「!」，旁边「待处理 1」；菜单里「待选择 · 演示任务：要用哪个方案？」')
    await show(view('attention'))
    await notify('choice', '要用哪个方案？')
    await countdown(8)

    say('⑤ 刚失败：鼻子前一个「×」；菜单第一行「刚才有任务失败了」')
    await show(view('failed'))
    await notify('failed', '429 rate limit')
    await countdown(8)
  }

  say('回到空闲，演示结束。')
  await show(view('idle'))
  await sleep(1500)
} finally {
  await cleanup()
}
