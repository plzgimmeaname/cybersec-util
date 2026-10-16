const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const checksDir = path.join(__dirname, '..', 'checks')
const weights = { low: 5, medium: 15, high: 25, critical: 40 }
const severityOrder = ['critical', 'high', 'medium', 'low']
const stateOrder = ['fail', 'unknown', 'pass']

const probeModules = {
  macos: () => require('./probes/macos'),
  windows: () => require('./probes/windows'),
  linux: () => require('./probes/linux')
}

function platform () {
  return { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform] || 'unknown'
}

function loadChecks () {
  return fs.readdirSync(checksDir)
    .filter(f => /\.ya?ml$/.test(f))
    .map(f => yaml.load(fs.readFileSync(path.join(checksDir, f), 'utf8')))
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
  const probe = probes[check.probe]
  if (!probe) return { ...base, state: 'unknown', detail: 'no probe for this os yet' }

  try {
    const actual = await probe()
    if (actual.status === 'unknown') return { ...base, state: 'unknown', detail: actual.detail }
    return { ...base, state: matches(actual, check.expect) ? 'pass' : 'fail', detail: actual.detail }
  } catch (e) {
    return { ...base, state: 'unknown', detail: e.message }
  }
}

// 0-100, unknowns left out so they don't drag the score
function score (results) {
  let total = 0
  let lost = 0
  for (const r of results) {
    if (r.state === 'unknown') continue
    const w = weights[r.severity] || 0
    total += w
    if (r.state === 'fail') lost += w
  }
  return total ? Math.round(100 * (1 - lost / total)) : null
}

async function run () {
  const os = platform()
  if (!probeModules[os]) return { os, score: null, results: [], time: new Date().toISOString() }

  const probes = probeModules[os]()
  const checks = loadChecks().filter(c => (c.platforms || []).includes(os))
  const results = await Promise.all(checks.map(c => runCheck(c, probes, os)))

  results.sort((a, b) =>
    stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state) ||
    severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))

  return { os, score: score(results), results, time: new Date().toISOString() }
}

module.exports = { platform, run, loadChecks, score }
