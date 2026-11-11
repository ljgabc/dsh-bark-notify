// One-off test harness for bark-notify: maps the bare schemastery import to
// the dsh installation copy, so index.js can be imported outside the Host.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./hooks.mjs', import.meta.url)
