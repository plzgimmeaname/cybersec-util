const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const checksDir = path.join(__dirname, '..', 'checks')
const weights = { low: 5, medium: 15, high: 25, critical: 40 }
const severityOrder = ['critical', 'high', 'medium', 'low']
const stateOrder = ['fail', 'unknown', 'info', 'pass']

const fixes = require('./fixes')

const probeModules = {
  macos: () => require('./probes/macos'),
  windows: () => require('./probes/windows'),
  linux: () => require('./probes/linux')
}

function platform () {
  return { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform] || 'unknown'
}

// a broken check file shows up as unknown instead of stopping the scan
function loadChecks () {
  return fs.readdirSync(checksDir)
    .filter(f => /\.ya?ml$/.test(f))
    .map(f => {
      try {
        return yaml.load(fs.readFileSync(path.join(checksDir, f), 'utf8'))
      } catch (e) {
        return { id: f, title: f, severity: 'low', platforms: ['windows', 'macos', 'linux'], broken: `check file is broken: ${e.reason || e.message}` }
      }
    })
}

// only system settings links, never web pages or files
const SAFE_LINK = /^(x-apple\.systempreferences:|ms-settings:)[\w.?=&-]*$/

function settingsLink (check, os) {
  const link = check.open && check.open[os]
  return link && SAFE_LINK.test(link) ? link : null
}

function linkFor (id) {
  const check = loadChecks().find(c => c.id === id)
  return check ? settingsLink(check, platform()) : null
}

// every key in expect must match what the probe saw
function matches (actual, expect) {
  return Object.entries(expect || {}).every(([k, v]) => actual[k] === v)
}

// shared probes work the same everywhere, the os file can override them
const allProbes = os => ({ ...require('./probes/software'), ...require('./probes/network'), ...require('./probes/local'), ...probeModules[os]() })

const HARD_LIMIT = 240000 // no single check may stall a scan

async function runCheck (check, probes, os) {
  const started = Date.now()
  const r = await runCheckInner(check, probes, os)
  r.ms = Date.now() - started
  return r
}

async function runCheckInner (check, probes, os) {
  const base = {
    id: check.id,
    title: check.title,
    why: check.why,
    severity: check.severity,
    benchmark: check.benchmark,
    category: check.category || 'other',
    slow: !!check.slow,
    settings: !!settingsLink(check, os),
    fix: (check.fix && check.fix[os]) || [],
    autofix: fixes.info(os, check.id)
  }
  if (check.broken) return { ...base, state: 'unknown', detail: check.broken }
  const probe = probes[check.probe]
  if (!probe) return { ...base, state: 'unknown', detail: 'no probe for this os yet' }

  try {
    const actual = await Promise.race([probe(), new Promise((_, rej) => setTimeout(() => rej(new Error('this check took too long and was stopped')), HARD_LIMIT))])
    // unknown and info are reported but never scored
    if (actual.status === 'unknown' || actual.status === 'info') return { ...base, state: actual.status, detail: actual.detail, items: actual.items || [] }
    return { ...base, state: matches(actual, check.expect) ? 'pass' : 'fail', detail: actual.detail, items: actual.items || [] }
  } catch (e) {
    return { ...base, state: 'unknown', detail: e.message }
  }
}

// 0-100, only pass and fail count, ignored checks don't
function score (results, ignored = new Set()) {
  let total = 0
  let lost = 0
  for (const r of results) {
    if (r.state !== 'pass' && r.state !== 'fail') continue
    if (ignored.has(r.id)) continue
    const w = weights[r.severity] || 0
    total += w
    if (r.state === 'fail') lost += w
  }
  return total ? Math.round(100 * (1 - lost / total)) : null
}

// onProgress gets the full list first, then each check as it finishes
async function run (onProgress = () => {}, { quick = false } = {}) {
  const os = platform()
  if (!probeModules[os]) return { os, score: null, results: [], time: new Date().toISOString() }

  const probes = allProbes(os)
  const checks = loadChecks().filter(c => (c.platforms || []).includes(os) && !(quick && c.slow))
  onProgress({ type: 'start', checks: checks.map(c => ({ id: c.id, title: c.title, category: c.category || 'other' })) })
  const results = await Promise.all(checks.map(async c => {
    const r = await runCheck(c, probes, os)
    onProgress({ type: 'done', id: r.id, state: r.state, severity: r.severity })
    return r
  }))

  return { os, score: score(results), results: sort(results), time: new Date().toISOString() }
}

function sort (results) {
  return results.sort((a, b) =>
    stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state) ||
    severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
}

// runs a single check again, for "check again" after a fix
async function runOne (id) {
  const os = platform()
  if (!probeModules[os]) return null
  const check = loadChecks().find(c => c.id === id && (c.platforms || []).includes(os))
  if (!check) return null
  return runCheck(check, allProbes(os), os)
}

module.exports = { platform, run, runOne, loadChecks, score, sort, linkFor }
