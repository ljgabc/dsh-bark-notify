/**
 * Browser half of the dsh-bark-notify bundle.
 *
 * Registers the plugin's configuration form on the Plugins page: the
 * dsh-bark-notify row (bundle page) gains a configure control whose page renders
 * this schema-backed form. Values and writes are Host-owned — the props.form
 * face from the plugin manager page (state + mutate over the settings
 * namespace `dsh-bark-notify`) — so saving writes the profile patch through the
 * standard configuration editor and the Host half picks the volatile values
 * up live, without a restart.
 *
 * Styling follows the host: only `--dsw-*` theme tokens and class names under
 * the `dshbn-` prefix.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bark-notify',
  factory (require) {
    const React = require('react')
    const { createElement: h, useState, useEffect } = React

    const NS = 'dsh-bark-notify'
    const SETTINGS_NAMESPACE = 'dsh-bark-notify'
    const ROW_CONFIG_KEY = 'dsh-bark-notify#dsh-bark-notify'
    const BUNDLE_CONFIG_KEY = 'dsh-bark-notify'

    const zh = {
      'summary.off': '未配置 Token，推送停用',
      'summary.on': '推送已启用',
      'collapse.title': '推送配置',
      'form.deviceKey': 'Bark 设备 Token',
      'form.deviceKeyHint': 'Bark App 首页地址 api.day.app/ 之后的那串字符',
      'form.server': 'Bark 服务器',
      'form.serverHint': '官方为 https://api.day.app，自建服务器填其地址',
      'form.clickUrl': '点击推送跳转地址',
      'form.clickUrlHint': '点击通知时打开的页面，例如 DSH 界面地址；留空则不跳转',
      'form.minTurnSeconds': '任务完成推送阈值（秒）',
      'form.minTurnSecondsHint': '回合运行超过该时长才推送「任务完成」；0 表示每次都推',
      'form.toggles': '推送场景',
      'form.onApproval': '需要审批时',
      'form.onQuestion': '需要选择时',
      'form.onGoalComplete': '目标完成时',
      'form.onTurnComplete': '任务完成时（受阈值限制）',
      'form.save': '保存',
      'form.saving': '保存中…',
      'form.saved': '已保存，立即生效',
      'form.saveFailed': '保存失败，请重试',
      'form.unavailable': '配置暂不可用',
      'form.loading': '加载中…',
    }
    const en = {
      'summary.off': 'No token configured — pushes disabled',
      'summary.on': 'Pushes enabled',
      'collapse.title': 'Push settings',
      'form.deviceKey': 'Bark device token',
      'form.deviceKeyHint': 'The string after api.day.app/ in the Bark app home URL',
      'form.server': 'Bark server',
      'form.serverHint': 'Official: https://api.day.app; self-hosted: its base URL',
      'form.clickUrl': 'Tap URL',
      'form.clickUrlHint': 'Page opened when the notification is tapped, e.g. this DSH UI; empty adds none',
      'form.minTurnSeconds': 'Turn-complete threshold (seconds)',
      'form.minTurnSecondsHint': 'Push "task finished" only for turns longer than this; 0 pushes every turn',
      'form.toggles': 'Push scenarios',
      'form.onApproval': 'Approval needed',
      'form.onQuestion': 'Question needs you',
      'form.onGoalComplete': 'Goal completed',
      'form.onTurnComplete': 'Turn finished (threshold applies)',
      'form.save': 'Save',
      'form.saving': 'Saving…',
      'form.saved': 'Saved — effective immediately',
      'form.saveFailed': 'Save failed, please retry',
      'form.unavailable': 'Configuration unavailable',
      'form.loading': 'Loading…',
    }

    let translate = key => (zh[key] ?? key)
    const t = key => translate(key)

    const css = `
.dshbn-form{max-width:560px;display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dshbn-field{display:flex;flex-direction:column;gap:6px}
.dshbn-label{color:var(--dsw-alias-label-primary);font-weight:600}
.dshbn-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}
.dshbn-input{height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-primary);color:var(--dsw-alias-label-primary);font:inherit}
.dshbn-input:focus{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.dshbn-input:disabled{opacity:.5}
.dshbn-checks{display:flex;flex-direction:column;gap:8px}
.dshbn-check{display:flex;align-items:center;gap:8px;cursor:pointer}
.dshbn-check input{accent-color:var(--dsw-alias-state-business-primary);width:15px;height:15px;margin:0}
.dshbn-actions{display:flex;align-items:center;gap:12px}
.dshbn-save{height:30px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:999px;background:var(--dsw-alias-button-info);color:var(--dsw-alias-button-info-text);font-size:13px;cursor:pointer}
@media (hover:hover){.dshbn-save:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}}
.dshbn-save:disabled{opacity:.5;cursor:default}
.dshbn-note{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:0}
.dshbn-error{color:var(--dsw-alias-state-danger-default);font-size:12px;margin:0}
.dshbn-summary{color:var(--dsw-alias-label-tertiary)}
.dshbn-collapse{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-primary);max-width:560px}
.dshbn-collapse>summary{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;list-style:none;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dshbn-collapse>summary::-webkit-details-marker{display:none}
.dshbn-collapse>summary::after{content:'›';margin-left:auto;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.dshbn-collapse[open]>summary::after{transform:rotate(90deg)}
@media (hover:hover){.dshbn-collapse>summary:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dshbn-collapse-state{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dshbn-collapse-body{padding:12px;border-top:.5px solid var(--dsw-alias-border-l2)}
`

    const TEXT_FIELDS = [
      ['deviceKey', 'form.deviceKey', 'form.deviceKeyHint'],
      ['server', 'form.server', 'form.serverHint'],
      ['clickUrl', 'form.clickUrl', 'form.clickUrlHint'],
    ]
    const TOGGLES = [
      ['onApproval', 'form.onApproval'],
      ['onQuestion', 'form.onQuestion'],
      ['onGoalComplete', 'form.onGoalComplete'],
      ['onTurnComplete', 'form.onTurnComplete'],
    ]

    function BarkConfigForm ({ view, form }) {
      // Every hook runs before any conditional return, so the summary and
      // page views never change this instance's hook order.
      useEffect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', JSON.stringify(NS))
        style.textContent = css
        document.head.append(style)
        return () => style.remove()
      }, [])
      const [draft, setDraft] = useState(null)
      const [saving, setSaving] = useState(false)
      const [note, setNote] = useState(null)

      if (view === 'summary') {
        const value = form?.state?.value
        const enabled = typeof value?.deviceKey === 'string' && value.deviceKey.trim() !== ''
        return h('span', { className: 'dshbn-summary' }, t(enabled ? 'summary.on' : 'summary.off'))
      }
      if (form === undefined) return h('p', { className: 'dshbn-note' }, t('form.unavailable'))
      const state = form.state
      const ready = state?.status === 'ready' && state.value !== undefined
      const value = ready ? state.value : {}
      const current = draft ?? {}
      const read = (key, fallback) => (key in current ? current[key] : value[key] ?? fallback)
      const dirty = draft !== null

      const save = async () => {
        if (!ready || saving) return
        setSaving(true)
        setNote(null)
        const ops = []
        for (const [key] of TEXT_FIELDS) {
          if (!(key in current)) continue
          const next = current[key]
          if (next === value[key]) continue
          ops.push({ op: 'set', path: [key], value: next })
        }
        for (const [key] of TOGGLES) {
          if (!(key in current)) continue
          const next = current[key]
          if (next === value[key]) continue
          ops.push({ op: 'set', path: [key], value: next })
        }
        if (read('minTurnSeconds', 60) !== value.minTurnSeconds) {
          const parsed = Number(read('minTurnSeconds', 60))
          ops.push({ op: 'set', path: ['minTurnSeconds'], value: Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 60 })
        }
        if (ops.length === 0) {
          setDraft(null)
          setNote('form.saved')
          setSaving(false)
          return
        }
        const ok = await form.mutate(ops, state.revision)
        setSaving(false)
        if (ok) {
          setDraft(null)
          setNote('form.saved')
        } else setNote('form.saveFailed')
      }

      if (!ready) {
        return h('div', { className: 'dshbn-form' }, h('p', { className: 'dshbn-note' },
          state?.status === 'loading' ? t('form.loading') : t('form.unavailable')))
      }

      const disabled = saving || state.writable === false
      return h('div', { className: 'dshbn-form' },
        ...TEXT_FIELDS.map(([key, labelKey, hintKey]) => h('label', { className: 'dshbn-field', key },
          h('span', { className: 'dshbn-label' }, t(labelKey)),
          h('input', {
            className: 'dshbn-input',
            type: key === 'deviceKey' ? 'password' : 'text',
            value: read(key, ''),
            disabled,
            autoComplete: 'off',
            spellCheck: false,
            onChange: event => setDraft({ ...current, [key]: event.target.value }),
          }),
          hintKey === null ? null : h('p', { className: 'dshbn-hint' }, t(hintKey)),
        )),
        h('label', { className: 'dshbn-field', key: 'minTurnSeconds' },
          h('span', { className: 'dshbn-label' }, t('form.minTurnSeconds')),
          h('input', {
            className: 'dshbn-input',
            type: 'number',
            min: 0,
            step: 1,
            value: read('minTurnSeconds', 60),
            disabled,
            onChange: event => setDraft({ ...current, minTurnSeconds: event.target.value }),
          }),
          h('p', { className: 'dshbn-hint' }, t('form.minTurnSecondsHint')),
        ),
        h('fieldset', { className: 'dshbn-field', key: 'toggles' },
          h('span', { className: 'dshbn-label' }, t('form.toggles')),
          h('div', { className: 'dshbn-checks' },
            ...TOGGLES.map(([key, labelKey]) => h('label', { className: 'dshbn-check', key },
              h('input', {
                type: 'checkbox',
                checked: read(key, true) !== false,
                disabled,
                onChange: event => setDraft({ ...current, [key]: event.target.checked }),
              }),
              t(labelKey),
            )),
          ),
        ),
        h('div', { className: 'dshbn-actions', key: 'actions' },
          h('button', {
            type: 'button',
            className: 'dshbn-save',
            disabled: disabled || !dirty,
            onClick: save,
          }, t(saving ? 'form.saving' : 'form.save')),
          note === null ? null : h('p', {
            className: note === 'form.saveFailed' ? 'dshbn-error' : 'dshbn-note',
          }, t(note)),
        ),
      )
    }

    /** Re-render on every snapshot change of one host-owned config form. */
    function useFormController (controller) {
      const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot())
      useEffect(() => {
        if (controller === undefined) return
        setSnapshot(controller.getSnapshot())
        return controller.subscribe(() => setSnapshot(controller.getSnapshot()))
      }, [controller])
      return snapshot
    }

    /** Bundle-page face: pulls the settings form itself via the configForms service.
    * Collapsed by default behind a native `<details>`; the summary line carries
    * the live enable state so a closed form still communicates status. The form
    * stays mounted while hidden, so an in-progress draft survives collapsing. */
    function BarkBundleConfig ({ view, configForms }) {
      useEffect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', JSON.stringify(NS))
        style.textContent = css
        document.head.append(style)
        return () => style.remove()
      }, [])
      const controller = configForms?.get(SETTINGS_NAMESPACE)
      const state = useFormController(controller)
      if (view === 'summary') return null
      if (controller === undefined || state === undefined) {
        return h('div', { className: 'dshbn-form' }, h('p', { className: 'dshbn-note' }, t('form.unavailable')))
      }
      const ready = state.status === 'ready' && state.value !== undefined
      const enabled = ready === true && typeof state.value.deviceKey === 'string' && state.value.deviceKey.trim() !== ''
      return h('details', { className: 'dshbn-collapse' },
        h('summary', null,
          h('span', null, t('collapse.title')),
          ready ? h('span', { className: 'dshbn-collapse-state' }, t(enabled ? 'summary.on' : 'summary.off')) : null,
        ),
        h('div', { className: 'dshbn-collapse-body' },
          h(BarkConfigForm, { view: 'page', form: { state, mutate: (ops, revision) => controller.mutate(ops, revision) } }),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply (ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-bark-notify: dictionaries')
          translate = locale.bind(NS)
        }
        const slots = ctx.get('slots')
        if (slots === undefined) throw new Error('dsh-bark-notify requires the slots service')
        ctx.effect(() => slots.inject('plugins.row.config', () => slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NS,
          },
          BarkConfigForm,
        )), 'dsh-bark-notify: plugins row config')
        ctx.effect(() => slots.inject('plugins.bundle.config', () => slots.register(
          {
            name: 'plugins.bundle.config',
            key: BUNDLE_CONFIG_KEY,
            locale: NS,
            inject: () => ({ configForms: ctx.get('configForms') }),
          },
          BarkBundleConfig,
        )), 'dsh-bark-notify: plugins bundle config')
      },
    }
  },
})
