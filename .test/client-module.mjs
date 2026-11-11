// Simulate the browser module loader for bark-notify/client.js.
import { readFileSync } from 'node:fs'

let registered = null
const reactShim = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: fn => fn,
}
const globalWindow = {
  __ModuleLoader__: {
    load: module => { registered = module },
  },
}
globalThis.window = globalWindow
const requireShim = name => {
  if (name === 'react') return reactShim
  throw new Error(`unexpected require: ${name}`)
}

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const factory = new Function('require', 'window', source + '\nreturn window.__ModuleLoader__?.last ?? undefined')
// Evaluate the module body with the shims; the loader captures the module.
const loader = globalWindow.__ModuleLoader__
loader.last = undefined
const wrapped = `(function(require, window){ ${source}\n })`
new Function('require', 'window', source)(requireShim, globalWindow)

assertRegistered: {
  if (registered === null || registered.id !== '@local/bark-notify') {
    console.error('FAIL: module did not register', registered)
    process.exit(1)
  }
  if (typeof registered.factory !== 'function') {
    console.error('FAIL: factory missing')
    process.exit(1)
  }
}
const plugin = registered.factory(requireShim)
if (Array.isArray(plugin.inject) && plugin.inject.includes('slots') && typeof plugin.apply === 'function') {
  // apply against a fake slots/locale ctx.
  const injections = []
  const registrations = []
  const fakeCtx = {
    get: name => name === 'locale'
      ? { register: () => () => {}, bind: ns => key => key }
      : name === 'slots'
        ? {
            inject: (slot, register) => { injections.push(slot); const dispose = register(); return dispose },
            register: options => { registrations.push(options); return () => {} },
          }
        : undefined,
    effect: dispose => { dispose(); return () => {} },
  }
  plugin.apply(fakeCtx)
  const rowConfig = registrations.find(options => options.name === 'plugins.row.config')
  const bundleConfig = registrations.find(options => options.name === 'plugins.bundle.config')
  const keysOk = rowConfig?.key === '@local/bark-notify#bark-notify' && bundleConfig?.key === '@local/bark-notify'
  if (injections.includes('plugins.row.config') && injections.includes('plugins.bundle.config') && keysOk) {
    console.log('OK: module registers; row key =', rowConfig.key, '; bundle key =', bundleConfig.key)
    process.exit(0)
  }
  console.error('FAIL: unexpected registrations', registrations)
  process.exit(1)
}
console.error('FAIL: plugin shape', plugin)
process.exit(1)
