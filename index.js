/**
 * Host half of the dsh-bark-notify bundle.
 *
 * Sends one Bark push (https://github.com/Finb/bark-server, API v2) at the
 * moments the user must return to the Harness:
 *
 * - `approval/request`      — a one-shot permission decision is pending.
 * - `user-questions/request`— an ask_user_question / plan-review card is pending.
 * - `goal/changed`          — the session goal reached `complete`.
 * - `agent/status`          — a top-level session finished a whole turn
 *                             (running → idle), only when the turn ran at
 *                             least `minTurnSeconds` so active chatting is
 *                             not spammed; intermediate tool steps never push.
 *
 * Listener options are load-bearing:
 * - `{ prepend: true }` — the two waterfall listeners MUST run BEFORE the
 *   GUI's api-remotes forwarder, which claims answered requests without
 *   calling `next()`; a later hook would never run. We push, then delegate.
 * - `{ global: true }` — agent-scoped dispatches filter non-matching
 *   contexts; a process-wide observer must bypass that filter.
 *
 * The waterfall listeners never block the chain: the push is fire-and-forget,
 * so the Web GUI cards appear with zero added latency.
 * Subagent child sessions (origin 'subagent' or delegationDepth > 0) are
 * filtered out of turn-completion pushes.
 *
 * All config fields are `.volatile()`: the Plugins page's configuration form
 * (and profile patch edits) apply live through in-place reference updates —
 * no plugin restart — and every read happens at use time.
 */

import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  /** Bark server base URL (official https://api.day.app or a self-hosted server). */
  server: z.string().default('https://api.day.app').volatile(),
  /** Bark device token; empty disables every push (listeners stay registered). */
  deviceKey: z.string().default('').volatile(),
  /** URL opened when a notification is tapped (e.g. this DSH GUI's address); empty adds none. */
  clickUrl: z.string().default('').volatile(),
  /** Push a turn-completion only after this many seconds; 0 pushes every turn. */
  minTurnSeconds: z.number().default(60).volatile(),
  /** Push pending approval decisions. */
  onApproval: z.boolean().default(true).volatile(),
  /** Push pending user questions. */
  onQuestion: z.boolean().default(true).volatile(),
  /** Push goal completion. */
  onGoalComplete: z.boolean().default(true).volatile(),
  /** Push turn completion (subject to minTurnSeconds). */
  onTurnComplete: z.boolean().default(true).volatile(),
})

/**
 * Read one config field whether the runtime wrapped it as a volatile
 * reference (`{ get() }`, the Loader's form for `.volatile()` fields) or left
 * a plain value (schema-validated in tests). Falls back when absent.
 */
function field(ref, fallback) {
  const value = typeof ref?.get === 'function' ? ref.get() : ref
  return value === undefined || value === null ? fallback : value
}

/** Push body cap; Bark accepts more, but a push must stay glanceable. */
const MAX_BODY_LENGTH = 500
/** Push title cap. */
const MAX_TITLE_LENGTH = 64
/** Assistant-reply snippet included in a turn-completion push. */
const MAX_SNIPPET_LENGTH = 120
/** HTTP budget for one push. */
const PUSH_TIMEOUT_MS = 10_000
/** Turn-completion pushes stay suppressed this long after a goal-completion push. */
const GOAL_SUPPRESSION_MS = 120_000
/** How long plugin disposal waits for in-flight pushes. */
const DRAIN_GRACE_MS = 3_000

/** Clamp a push text to a bounded single-line-ish string. */
function truncate(value, max) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Pick the best human-readable reason: zh locale, en locale, then raw reason. */
function pickDisplayReason(displayReason, reason) {
  if (displayReason !== null && typeof displayReason === 'object') {
    for (const locale of ['zh', 'zh-CN', 'en']) {
      const candidate = displayReason[locale]
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate
    }
  }
  return typeof reason === 'string' ? reason : ''
}

/** Directory name of a session cwd, or a short placeholder. */
function cwdLabel(header) {
  if (typeof header.cwd !== 'string' || header.cwd === '') return '未知目录'
  const parts = header.cwd.split('/').filter(part => part !== '')
  return parts.length > 0 ? parts[parts.length - 1] : header.cwd
}

/** Whether this agent belongs to a subagent child session rather than a top-level one. */
function isSubagent(agent) {
  const header = agent.session?.header
  if (header === undefined || header === null) return false
  return header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0
}

/** First text block of the last committed assistant message, for the push snippet. */
function lastAssistantSnippet(session) {
  try {
    const events = session.snapshotEvents()
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index]
      if (event.type !== 'assistant/message') continue
      const content = event.message?.content
      if (!Array.isArray(content)) return ''
      for (const block of content) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          return truncate(block.text, MAX_SNIPPET_LENGTH)
        }
      }
      return ''
    }
  } catch {
    // The snippet is decorative; any read failure just drops it.
  }
  return ''
}

/** `83s` or `4m23s`-style duration label. */
function durationLabel(seconds) {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

export function apply(ctx, config) {
  // Volatile fields are read at use time, so form edits apply live without a
  // plugin restart.
  const readServer = () => {
    const value = field(config.server, '')
    return typeof value === 'string' ? value.replace(/\/+$/, '') : ''
  }
  const readDeviceKey = () => {
    const value = field(config.deviceKey, '')
    return typeof value === 'string' ? value.trim() : ''
  }
  const readFlag = (name) => field(config[name], true) !== false

  if (readDeviceKey() === '') {
    ctx.logger.warn('dsh-bark-notify: deviceKey is empty — pushes are disabled. Set it in the plugin config (Plugins page → bark-notify → 配置).')
  } else if (readServer() === '' || !/^https?:\/\//u.test(readServer())) {
    ctx.logger.warn(`dsh-bark-notify: server must be an http(s) URL (got ${JSON.stringify(field(config.server, ''))}) — pushes are disabled.`)
  }

  /** In-flight pushes, so disposal does not cut off a notification mid-flight. */
  const inFlight = new Set()

  /**
   * Fire one Bark push. Never throws and never blocks the caller: resolution
   * (success log, failure log) happens on the tracked floating promise.
   */
  const send = (title, body) => {
    const server = readServer()
    const deviceKey = readDeviceKey()
    if (deviceKey === '' || server === '' || !/^https?:\/\//u.test(server)) return
    const payload = {
      device_key: deviceKey,
      title: truncate(title, MAX_TITLE_LENGTH),
      body: truncate(body, MAX_BODY_LENGTH),
      group: 'DSH',
    }
    const clickUrl = typeof field(config.clickUrl, '') === 'string' ? field(config.clickUrl, '').trim() : ''
    if (clickUrl !== '') payload.url = clickUrl
    const push = (async () => {
      const response = await fetch(`${server}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      })
      const text = await response.text().catch(() => '')
      if (!response.ok || !text.includes('"code":200')) {
        ctx.logger.warn(`dsh-bark-notify: push "${payload.title}" failed: HTTP ${response.status} ${truncate(text, 200)}`)
        return
      }
      ctx.logger.info(`dsh-bark-notify: pushed "${payload.title}"`)
    })().catch(error => {
      ctx.logger.warn(`dsh-bark-notify: push "${payload.title}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => {
      inFlight.delete(push)
    })
    inFlight.add(push)
  }

  ctx.effect(() => async () => {
    if (inFlight.size === 0) return
    await Promise.race([
      Promise.allSettled([...inFlight]),
      new Promise(resolve => setTimeout(resolve, DRAIN_GRACE_MS)),
    ])
  }, 'dsh-bark-notify: drain in-flight pushes')

  /**
   * Per-agent turn tracking. Weak so agent disposal garbage-collects entries;
   * `runningSince` is undefined for turns already in flight at activation,
   * whose duration is unknown and therefore not pushed.
   */
  const turns = new WeakMap()

  // A permission decision is pending. Observe only: push, then delegate.
  ctx.on('approval/request', (req, next) => {
    if (readFlag('onApproval')) {
      const reason = pickDisplayReason(req.displayReason, req.reason)
      const body = reason !== ''
        ? `工具 ${req.toolName} 请求审批：${reason}`
        : `工具 ${req.toolName} 请求审批`
      send('DSH 需要审批', body)
    }
    return next()
  }, { global: true, prepend: true })

  // A structured question (ask_user_question, plan review) is pending. Observe only.
  ctx.on('user-questions/request', (request, next) => {
    if (readFlag('onQuestion')) {
      const questions = Array.isArray(request.questions) ? request.questions : []
      const texts = questions
        .slice(0, 2)
        .map(question => (question !== null && typeof question === 'object' && typeof question.question === 'string' ? question.question : ''))
        .filter(text => text !== '')
      const more = questions.length > 2 ? `\n（还有 ${questions.length - 2} 个问题）` : ''
      send('DSH 需要你选择', texts.length > 0 ? `${texts.join('\n')}${more}` : '代理提出了一个问题，请回来查看')
    }
    return next()
  }, { global: true, prepend: true })

  // The session goal reached `complete`.
  ctx.on('goal/changed', ({ agent, change }) => {
    if (!readFlag('onGoalComplete')) return
    if (change?.operation !== 'complete') return
    const objective = typeof change.goal?.objective === 'string' ? change.goal.objective : ''
    const state = turns.get(agent) ?? {}
    state.goalCompletedAt = Date.now()
    turns.set(agent, state)
    send('DSH 目标完成', objective !== '' ? objective : '会话目标已完成')
  }, { global: true })

  // A whole turn of a top-level session finished (running → idle).
  ctx.on('agent/status', ({ agent, status }) => {
    if (!readFlag('onTurnComplete')) return
    if (isSubagent(agent)) return
    let state = turns.get(agent)
    if (status === 'running') {
      turns.set(agent, { ...(state ?? {}), runningSince: Date.now() })
      return
    }
    if (status !== 'idle') return
    if (state === undefined) {
      turns.set(agent, {})
      return
    }
    const runningSince = state.runningSince
    state.runningSince = undefined
    turns.set(agent, state)

    // A goal-completion push already covered this turn's ending.
    if (state.goalCompletedAt !== undefined) {
      const withinWindow = Date.now() - state.goalCompletedAt < GOAL_SUPPRESSION_MS
      state.goalCompletedAt = undefined
      turns.set(agent, state)
      if (withinWindow) return
    }
    if (runningSince === undefined) return
    const seconds = (Date.now() - runningSince) / 1000
    const minTurnSeconds = Number.isFinite(field(config.minTurnSeconds, 60)) ? Math.max(0, field(config.minTurnSeconds, 60)) : 60
    if (seconds < minTurnSeconds) return

    const header = agent.session?.header
    const snippet = lastAssistantSnippet(agent.session)
    const lines = [`${cwdLabel(header)} · 用时 ${durationLabel(seconds)}`]
    if (snippet !== '') lines.push(snippet)
    send('DSH 任务完成', lines.join('\n'))
  }, { global: true })
}
