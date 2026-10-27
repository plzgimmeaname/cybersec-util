// keeps past scans and a "known good" baseline, then says what changed
const fs = require('fs')
const path = require('path')

const KEEP = 60 // past scans kept on disk

function dirs (base) {
  const history = path.join(base, 'history')
  fs.mkdirSync(history, { recursive: true })
  return { history, baseline: path.join(base, 'baseline.json') }
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

// only names are compared, notes like "signed in now" change every run
function snapshot (report) {
  const checks = {}
  for (const r of report.results) {
    checks[r.id] = { title: r.title, state: r.state, items: (r.items || []).map(i => i.text) }
  }
  return { time: report.time, score: report.score, checks }
}

function diff (base, now) {
  const changes = []
  for (const [id, cur] of Object.entries(now.checks)) {
    const old = base.checks[id]
    if (!old) continue // brand new check from an app update, nothing to compare

    if (old.state === 'pass' && cur.state === 'fail') changes.push({ kind: 'worse', sign: '↓', title: cur.title, text: 'was ok, now needs fixing' })
    if (old.state === 'fail' && cur.state === 'pass') changes.push({ kind: 'better', sign: '↑', title: cur.title, text: 'fixed' })

    const before = new Set(old.items)
    const after = new Set(cur.items)
    for (const t of after) if (!before.has(t)) changes.push({ kind: 'added', sign: '+', title: cur.title, text: t })
    for (const t of before) if (!after.has(t)) changes.push({ kind: 'removed', sign: '−', title: cur.title, text: t })
  }
  return changes
}

function trend (history) {
  return fs.readdirSync(history).filter(f => f.endsWith('.json')).sort().slice(-12)
    .map(f => readJson(path.join(history, f)))
    .filter(s => s && s.score != null)
    .map(s => ({ time: s.time, score: s.score }))
}

// saves this scan, first scan ever becomes the baseline
function record (base, report) {
  const d = dirs(base)
  const snap = snapshot(report)
  fs.writeFileSync(path.join(d.history, `${report.time.replace(/[:.]/g, '-')}.json`), JSON.stringify(snap))

  const old = fs.readdirSync(d.history).filter(f => f.endsWith('.json')).sort()
  for (const f of old.slice(0, Math.max(0, old.length - KEEP))) fs.unlinkSync(path.join(d.history, f))

  let baseline = readJson(d.baseline)
  const first = !baseline
  if (first) {
    baseline = snap
    fs.writeFileSync(d.baseline, JSON.stringify(snap))
  }
  return { first, since: baseline.time, changes: first ? [] : diff(baseline, snap), trend: trend(d.history) }
}

// "these changes are fine": the latest scan becomes the new baseline
function accept (base) {
  const d = dirs(base)
  const latest = fs.readdirSync(d.history).filter(f => f.endsWith('.json')).sort().pop()
  if (!latest) return null
  fs.copyFileSync(path.join(d.history, latest), d.baseline)
  return readJson(d.baseline).time
}

module.exports = { record, accept, diff, snapshot }
