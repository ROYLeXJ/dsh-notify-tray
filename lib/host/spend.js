/**
 * Money: the spend ledger on disk, the price catalog it is priced with, the
 * plan's quota reading, and the DeepSeek account balance.
 */
import { findDshVersion, findPiCatalogFile, loadPiCatalog, npmGlobalDshDir } from '../pricing.js'
import { fetchQuota, runQuotaPlan } from '../quota.js'

/** Harness version sent as account client metadata when the installed one cannot be read. */
const DSH_VERSION_FALLBACK = '0.2.1-rc.2'
/** How often a price catalog that was not found is looked for again. */
const CATALOG_RETRY_MS = 10 * 60_000

export function setupSpend(ctx, host) {
  const { cfg, logger, ledger, debug } = host

  // ---- ledger persistence -------------------------------------------------
  ctx.effect(() => {
    ledger.load().then(host.refresh)
    const timer = setInterval(() => ledger.save().catch(() => {}), 30_000)
    return () => {
      clearInterval(timer)
      ledger.save().catch(() => {})
    }
  }, 'notify-tray: ledger')

  // ---- pi-ai price catalog (the one DSH's model selector reads) -------------
  // Not found at startup (an install layout we do not guess, npm still busy…):
  // ask npm once, then keep looking every few minutes until it turns up.
  ctx.effect(() => {
    let disposed = false
    let timer
    let askedNpm = false
    const attempt = async () => {
      let loaded = await loadPiCatalog()
      if (!loaded && !askedNpm) {
        askedNpm = true
        const dir = await npmGlobalDshDir()
        const file = dir ? findPiCatalogFile([dir]) : undefined
        if (file) loaded = await loadPiCatalog({ file })
      }
      if (disposed) return
      if (!loaded) {
        timer = setTimeout(() => attempt().catch(() => {}), CATALOG_RETRY_MS)
        timer.unref?.()
        return
      }
      host.pi = loaded
      debug('pi catalog', loaded.file)
      host.refresh()
    }
    attempt().catch(() => {})
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, 'notify-tray: price catalog')

  // ---- plan quota polling ---------------------------------------------------
  let polling
  host.pollQuota = async (force = false) => {
    const spec = host.quotaSpec()
    const ref = (cfg.planApiKeyEnv ?? '').trim()
    const signature = host.quotaSignature()
    if (!spec || !ref || (!force && !cfg.planAutoQuota)) {
      if (host.quota !== undefined) { host.quota = undefined; host.refresh() }
      return undefined
    }
    if (polling) return polling
    polling = (async () => {
      // The key DSH's Models page saved first, then the environment variable of the same name.
      let saved
      const reading = await runQuotaPlan([
        {
          id: 'saved',
          label: 'DSH 保存的 Key',
          available: async () => {
            const credentials = ctx.get('credentials')
            if (!credentials) return '这个 DSH 没有 Key 存储'
            try {
              saved = (await credentials.resolve(ref))?.value
            } catch (error) {
              debug('credential', String(error))
              return '读取失败'
            }
            return saved ? true : `没有保存 ${ref}`
          },
          fetch: () => fetchQuota(spec, saved),
        },
        {
          id: 'env',
          label: '环境变量',
          available: () => {
            const value = process.env[ref]
            if (!value) return `没有设置 ${ref}`
            return value === saved ? '和保存的 Key 相同，不再重试' : true
          },
          fetch: () => fetchQuota(spec, process.env[ref]),
        },
      ], { noneError: `没找到 API Key：${ref} 没有保存，也没有设置为环境变量` })
      host.quota = { ...reading, signature, spec: { kind: spec.kind, url: spec.url } }
      debug('quota', host.quota)
      host.refresh()
      return host.quota
    })().finally(() => { polling = undefined })
    return polling
  }
  ctx.effect(() => {
    let timer
    let lastSignature = host.quotaSignature()
    let lastPoll = 0
    const tick = () => {
      const signature = host.quotaSignature()
      const due = Date.now() - lastPoll >= Math.max(1, cfg.quotaPollMinutes) * 60_000
      if (signature !== lastSignature || due) {
        lastSignature = signature
        lastPoll = Date.now()
        host.pollQuota().catch(() => {})
      }
      timer = setTimeout(tick, 15_000)
    }
    tick()
    return () => clearTimeout(timer)
  }, 'notify-tray: quota poll')

  // ---- DeepSeek account balance (optional service) ------------------------
  ctx.inject(['deepseekAccount'], (ctx) => {
    const client = {
      // Mirrors DSH's own settings page: the installed harness version and the UI locale.
      version: findDshVersion() ?? DSH_VERSION_FALLBACK,
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const poll = async () => {
      try {
        const balance = await ctx.deepseekAccount.getBalance(client)
        if (balance?.status === 'ready') ledger.balance(balance.value)
        if (host.account.usageUrl === undefined) {
          const state = await ctx.deepseekAccount.getState?.()
          host.account.usageUrl = state?.links?.usageUrl
        }
      } catch (error) {
        logger.debug?.('读取账户余额失败', error)
      }
    }
    ctx.effect(() => {
      let timer
      const loop = () => {
        poll()
        timer = setTimeout(loop, Math.max(1, cfg.balancePollMinutes) * 60_000)
      }
      loop()
      return () => clearTimeout(timer)
    }, 'notify-tray: balance poll')
    // A finished turn is when spend lands; refresh shortly after.
    ctx.on('agent/status', ({ status }) => {
      if (status === 'idle') setTimeout(poll, 5000)
    })
  })
}
