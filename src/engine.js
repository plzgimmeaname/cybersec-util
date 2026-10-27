const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const checksDir = path.join(__dirname, '..', 'checks')
const weights = { low: 5, medium: 15, high: 25, critical: 40 }
const severityOrder = ['critical', 'high', 'medium', 'low']
const stateOrder = ['fail', 'unknown', 'info', 'pass']

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

// every key in expect must match what the probe saw
function matches (actual, expect) {
  return Object.entries(expect || {}).every(([k, v]) => actual[k] === v)
}

async function runCheck (check, probes, os) {
  const base = {
    id: check.id,
    title: check.title,
    why: check.why,
    severity: check.severity,
    benchmark: check.benchmark,
    fix: (check.fix && check.fix[os]) || []
  }
  if (check.broken) return { ...base, state: 'unknown', detail: check.broken }
  const probe = probes[check.probe]
  if (!probe) return { ...base, state: 'unknown', detail: 'no probe for this os yet' }

  try {
    const actual = await probe()
    // unknown and info are reported but never scored
    if (actual.status === 'unknown' || actual.status === 'info') return { ...base, state: actual.status, detail: actual.detail, items: actual.items || [] }
    return { ...base, state: matches(actual, check.expect) ? 'pass' : 'fail', detail: actual.detail, items: actual.items || [] }
  } catch (e) {
    return { ...base, state: 'unknown', detail: e.message }
  }
}

// 0-100, only pass and fail count
function score (results) {
  let total = 0
  let lost = 0
  for (const r of results) {
    if (r.state !== 'pass' && r.state !== 'fail') continue
    const w = weights[r.severity] || 0
    total += w
    if (r.state === 'fail') lost += w
  }
  return total ? Math.round(100 * (1 - lost / total)) : null
}

// onProgress gets the full list first, then each check as it finishes
async function run (onProgress = () => {}) {
  const os = platform()
  if (!probeModules[os]) return { os, score: null, results: [], time: new Date().toISOString() }

  // shared probes work the same everywhere, the os file can override them
  const probes = { ...require('./probes/software'), ...probeModules[os]() }
  const checks = loadChecks().filter(c => (c.platforms || []).includes(os))
  onProgress({ type: 'start', checks: checks.map(c => ({ id: c.id, title: c.title })) })
  const results = await Promise.all(checks.map(async c => {
    const r = await runCheck(c, probes, os)
    onProgress({ type: 'done', id: r.id, state: r.state, severity: r.severity })
    return r
  }))

  results.sort((a, b) =>
    stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state) ||
    severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))

  return { os, score: score(results), results, time: new Date().toISOString() }
}

module.exports = { platform, run, loadChecks, score }
