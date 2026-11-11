// Offline behavioral test for bark-notify/index.js.
// Run: node --import ./.test/register.mjs ./.test/run.mjs
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { apply, Config } from '../index.js'

const received = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    received.push({ url: req.url, method: req.method, contentType: req.headers['content-type'], json: JSON.parse(body) })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"code":200,"message":"success"}')
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()

const logs = []
const logger = {
  info: message => logs.push(['info', message]),
  warn: message => logs.push(['warn', message]),
}
const listeners = new Map()
const effects = []
const ctx = {
  logger,
  on: (name, listener) => {
    const list = listeners.get(name) ?? []
    list.push(listener)
    listeners.set(name, list)
  },
  effect: (dispose, label) => { effects.push({ dispose, label }) },
}

const config = Config['~standard'].validate({
  server: `http://127.0.0.1:${port}`,
  deviceKey: 'test-key',
  minTurnSeconds: 0,
}).value
apply(ctx, config)

const fire = (name, ...args) => {
  const list = listeners.get(name)
  assert.ok(list !== undefined, `no listener for ${name}`)
  assert.equal(list.length, 1, `expected one listener for ${name}`)
  return list[0](...args)
}
const nextOutcome = async () => 'allowed-once'
const settle = () => new Promise(resolve => setTimeout(resolve, 50))
const titles = () => received.map(entry => entry.json.title)

// The Config export must be a native schemastery schema (loader requirement).
assert.equal(Reflect.get(Config, Symbol.for('schemastery')), true)

// 1. approval/request: pushes, delegates untouched, next() result passes through.
{
  const outcome = await fire('approval/request', {
    agent: {},
    toolName: 'bash',
    reason: 'needs workspace-write',
    displayReason: { 'zh': '需要写入工作区之外的文件', en: 'needs to write outside the workspace' },
  }, nextOutcome)
  assert.equal(outcome, 'allowed-once')
  await settle()
  assert.deepEqual(titles(), ['DSH 需要审批'])
  assert.equal(received[0].url, '/push')
  assert.equal(received[0].method, 'POST')
  assert.equal(received[0].json.device_key, 'test-key')
  assert.ok(received[0].json.body.includes('bash'))
  assert.ok(received[0].json.body.includes('需要写入工作区之外的文件'))
  assert.equal(received[0].json.group, 'DSH')
}

// 2. user-questions/request: pushes question texts.
{
  const answer = await fire('user-questions/request', {
    questions: [
      { id: 'q1', question: '用哪种模式？', options: [{ label: 'A' }, { label: 'B' }] },
      { id: 'q2', question: '要生成测试吗？' },
      { id: 'q3', question: '第三问' },
    ],
  }, async () => ({ answers: [] }))
  assert.deepEqual(answer, { answers: [] })
  await settle()
  assert.deepEqual(titles().slice(-1), ['DSH 需要你选择'])
  const body = received[received.length - 1].json.body
  assert.ok(body.includes('用哪种模式？') && body.includes('要生成测试吗？') && body.includes('还有 1 个问题'))
}

// 3. goal/changed complete pushes the objective.
{
  const agent = { session: { header: { cwd: '/tmp/g', delegationDepth: 0 } } }
  fire('goal/changed', { agent, change: { operation: 'complete', goal: { objective: '迁移所有配置到新插件' } } })
  await settle()
  assert.deepEqual(titles().slice(-1), ['DSH 目标完成'])
  assert.ok(received[received.length - 1].json.body.includes('迁移所有配置到新插件'))
}

// 4. agent/status running→idle pushes turn completion with snippet.
{
  const agent = {
    session: {
      header: { cwd: '/Volumes/USBData/projects/dsh-plugins', origin: undefined, delegationDepth: 0 },
      snapshotEvents: () => [
        { type: 'user/message', message: {} },
        { type: 'assistant/message', message: { content: [{ type: 'thinking', text: '内部思考' }, { type: 'text', text: '全部完成，共修改 3 个文件。' }] } },
      ],
    },
  }
  fire('agent/status', { agent, status: 'running' })
  fire('agent/status', { agent, status: 'idle' })
  await settle()
  assert.deepEqual(titles().slice(-1), ['DSH 任务完成'])
  const body = received[received.length - 1].json.body
  assert.ok(body.includes('dsh-plugins'), body)
  assert.ok(body.includes('全部完成，共修改 3 个文件。'), body)
  assert.ok(!body.includes('内部思考'), body)
}

// 5. Subagent sessions never push turn completion.
{
  const subagent = {
    session: { header: { cwd: '/tmp', origin: 'subagent', delegationDepth: 1 }, snapshotEvents: () => [] },
  }
  fire('agent/status', { agent: subagent, status: 'running' })
  fire('agent/status', { agent: subagent, status: 'idle' })
  await settle()
  assert.ok(!titles().includes('DSH 任务完成') || titles().lastIndexOf('DSH 任务完成') < 4)
}

// 6. Goal completion suppresses the same turn's completion push.
{
  const agent = {
    session: { header: { cwd: '/tmp/x', delegationDepth: 0 }, snapshotEvents: () => [] },
  }
  fire('agent/status', { agent, status: 'running' })
  fire('goal/changed', { agent, change: { operation: 'complete', goal: { objective: '目标 X' } } })
  fire('agent/status', { agent, status: 'idle' })
  await settle()
  const recent = received.map(entry => entry.json.title)
  assert.ok(recent.includes('DSH 目标完成'))
  // The goal push replaced this turn's completion push: still only test 4's single 任务完成.
  assert.equal(recent.filter(title => title === 'DSH 任务完成').length, 1)
  assert.equal(recent[recent.length - 1], 'DSH 目标完成')
}

// 7. Empty deviceKey: no push, no crash, warning logged once at activation.
{
  const quietCtx = { logger: { info: () => {}, warn: m => logs.push(['warn', m]) }, effect: () => {} }
  const quietListeners = new Map()
  quietCtx.on = (name, listener) => {
    const list = quietListeners.get(name) ?? []
    list.push(listener)
    quietListeners.set(name, list)
  }
  const before = received.length
  apply(quietCtx, { server: `http://127.0.0.1:${port}`, deviceKey: '', group: 'DSH', minTurnSeconds: 0 })
  quietListeners.get('approval/request')[0]({ toolName: 'bash' }, nextOutcome)
  await settle()
  assert.equal(received.length, before)
  assert.ok(logs.some(([level, message]) => level === 'warn' && message.includes('deviceKey is empty')))
}

// 8. minTurnSeconds threshold: a short turn does not push.
{
  const ctx2 = { logger, on: (name, listener) => {
    const key = `thr:${name}`
    const list = listeners.get(key) ?? []
    list.push(listener)
    listeners.set(key, list)
  }, effect: () => {} }
  apply(ctx2, Config['~standard'].validate({ server: `http://127.0.0.1:${port}`, deviceKey: 'test-key', minTurnSeconds: 3600 }).value)
  const agent = { session: { header: { cwd: '/tmp/y', delegationDepth: 0 }, snapshotEvents: () => [] } }
  listeners.get('thr:agent/status')[0]({ agent, status: 'running' })
  listeners.get('thr:agent/status')[0]({ agent, status: 'idle' })
  await settle()
  assert.equal(titles().filter(title => title === 'DSH 任务完成').length, 1) // only case 4's push
}

// 9. Disposal effect drains in-flight pushes without hanging.
{
  assert.equal(effects.length, 1)
  await effects[0].dispose()
}

server.close()
console.log(`OK: ${received.length} pushes captured, all assertions passed`)
console.log(logs.filter(([level]) => level === 'info').map(([, message]) => message).join('\n'))
