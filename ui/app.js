const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]

// small line icons, 24x24
const ICONS = {
  shield: 'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  changes: 'M7 4v16 M7 4l-3 3 M7 4l3 3 M17 20V4 M17 20l-3-3 M17 20l3-3',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mute: 'M3 3l18 18 M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7 M6.6 6.6A17 17 0 0 0 2 12s3.5 6 10 6a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  folder: 'M3 6h6l2 2h10v11H3z',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12 M18 6L6 18',
  dash: 'M6 12h12',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  device: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  apps: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M17 14v6 M14 17h6',
  network: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9 M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9',
  accounts: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c0-4 3.6-6 8-6s8 2 8 6',
  alert: 'M12 3l10 18H2L12 3z M12 10v5 M12 18h.01',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  chevron: 'M9 6l6 6-6 6'
}

const SVG = 'http://www.w3.org/2000/svg'

function icon (name) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of (ICONS[name] || '').split(/ (?=M)/)) {
    const p = document.createElementNS(SVG, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  return svg
}

function el (tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function svgEl (tag, attrs) {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

function button (cls, ic, text, onClick) {
  const b = el('button', cls)
  if (ic) b.append(icon(ic))
  b.append(el('span', null, text))
  b.addEventListener('click', e => { e.stopPropagation(); onClick(b, e) })
  return b
}

const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : ''

function fillIcons (root = document) {
  for (const n of root.querySelectorAll('[data-icon]')) {
    if (!n.querySelector('svg')) n.prepend(icon(n.dataset.icon))
  }
}

// labels and colours shared across pages

const AREAS = {
  device: { name: 'Device', icon: 'device' },
  apps: { name: 'Updates & apps', icon: 'apps' },
  network: { name: 'Network', icon: 'network' },
  accounts: { name: 'Accounts', icon: 'accounts' },
  other: { name: 'Other', icon: 'list' }
}
const STATE = {
  pass: { color: 'green', icon: 'check', label: 'OK' },
  fail: { color: 'red', icon: 'x', label: 'Needs fixing' },
  unknown: { color: 'gray', icon: 'dash', label: "Couldn't check" },
  info: { color: 'gray', icon: 'info', label: 'Note' },
  ignored: { color: 'gray', icon: 'mute', label: 'Ignored' }
}
const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const PAGES = {
  overview: ['Overview', 'How secure this computer is right now'],
  checks: ['Checks', 'Every check, what was found and how to fix it'],
  changes: ['Changes', 'What changed since your known-good checkup'],
  history: ['History', 'Your score over time'],
  settings: ['Settings', 'Preferences, ignored checks and privacy']
}

const state = { info: null, settings: null, report: null, view: 'overview', filter: 'all', area: 'all', query: '', open: new Set(), scanning: false }

// an ignored check that still fails shows as ignored, a fixed one shows as ok
const shownState = r => r.ignored && r.state !== 'pass' ? 'ignored' : r.state
const needsFix = r => r.state === 'fail' && !r.ignored

// pages

function show (view) {
  if (!PAGES[view]) return
  state.view = view
  for (const b of $$('.nav-item')) b.classList.toggle('active', b.dataset.view === view)
  for (const v of $$('.view')) v.hidden = v.id !== `view-${view}`
  $('#page-title').textContent = PAGES[view][0]
  $('#page-sub').textContent = PAGES[view][1]
  $('#main').scrollTo({ top: 0, behavior: 'instant' })
  if (view === 'history') renderHistory()
  if (view === 'settings') renderSettings()
}

// formatting

function when (iso) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days} day${days > 1 ? 's' : ''} ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
const fullDate = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const scoreColor = s => s == null ? 'gray' : s >= 80 ? 'green' : s >= 50 ? 'yellow' : 'red'
const daysSince = iso => (Date.now() - new Date(iso)) / 86400000

function verdict (score, fails) {
  if (score == null) return ['Not enough to score', 'Most checks could not run on this computer.']
  if (fails === 0) return ['Looking good', 'Every check that could run passed. Run a checkup now and then to stay on top of it.']
  if (score >= 80) return ['Mostly secure', `A few things are worth fixing. Start with the ${fails === 1 ? 'one' : 'ones'} below.`]
  if (score >= 50) return ['Needs some attention', 'Some important settings are off. The fixes below make the biggest difference.']
  return ['At risk', 'Several important protections are off. Fix the items below first.']
}

// scanning

async function scan () {
  if (state.scanning) return
  state.scanning = true
  const btn = $('#scan')
  btn.disabled = true
  btn.classList.add('busy')
  $('#scan-label').textContent = 'Checking…'
  $('#export').disabled = true
  $('#progress').hidden = false
  $('#progress-fill').style.width = '0'
  show('overview')
  $('#welcome').hidden = true
  $('#results').hidden = true
  $('#live').hidden = false

  try {
    state.report = await window.checkup.scan()
    state.open.clear()
    render()
  } catch (e) {
    toast(`The checkup stopped: ${e.message}`, null, 'error')
    $('#live').hidden = true
    $(state.report ? '#results' : '#welcome').hidden = false
  } finally {
    state.scanning = false
    btn.disabled = false
    btn.classList.remove('busy')
    $('#scan-label').textContent = 'Run again'
    $('#progress').hidden = true
  }
}

let liveTotal = 0
let liveDone = 0

window.checkup.onProgress(p => {
  if (p.type === 'start') {
    liveTotal = p.checks.length
    liveDone = 0
    const list = $('#live-list')
    list.replaceChildren()
    for (const c of p.checks) {
      const li = el('li')
      li.dataset.id = c.id
      li.append(el('span', 'spinner'), el('span', null, c.title))
      list.append(li)
    }
    $('#live-total').textContent = liveTotal
  }
  if (p.type === 'done') {
    liveDone++
    const li = $(`#live-list li[data-id="${CSS.escape(p.id)}"]`)
    if (li) {
      li.classList.add('done')
      const s = STATE[p.state] || STATE.unknown
      const dot = el('span', `status ${s.color}`)
      dot.append(icon(s.icon))
      li.firstChild.replaceWith(dot)
    }
  }
  $('#live-count').textContent = liveDone
  $('#progress-fill').style.width = `${liveTotal ? (liveDone / liveTotal) * 100 : 0}%`
})

// overview

function render ({ animate = true } = {}) {
  const r = state.report
  if (!r) return
  const results = r.results
  const fails = results.filter(needsFix)
  const passes = results.filter(x => x.state === 'pass')
  const ignored = results.filter(x => shownState(x) === 'ignored').length
  const other = results.length - fails.length - passes.length - ignored

  $('#live').hidden = true
  $('#welcome').hidden = true
  $('#results').hidden = false
  $('#export').disabled = false

  // score ring
  const arc = $('#arc')
  arc.setAttribute('class', `arc ${scoreColor(r.score)}`)
  const target = 175.9 * (1 - (r.score ?? 0) / 100)
  if (animate) {
    arc.style.strokeDashoffset = 175.9
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = target }))
  } else {
    arc.style.strokeDashoffset = target
  }
  $('#score-num').textContent = r.score ?? '–'

  const [title, sub] = verdict(r.score, fails.length)
  $('#verdict').textContent = title
  $('#verdict-sub').textContent = sub

  const counts = $('#counts')
  counts.replaceChildren()
  if (fails.length) counts.append(pill('red', 'x', `${plural(fails.length, 'issue')} to fix`))
  counts.append(pill('green', 'check', `${passes.length} passed`))
  if (ignored) counts.append(pill('', 'mute', `${ignored} ignored`))
  if (other) counts.append(pill('', 'dash', `${other} not scored`))

  renderTrend(r.drift && r.drift.trend)
  renderDrift(r.drift)
  renderTopFixes(fails)
  renderAreas(results)
  renderChecks()

  const bc = $('#badge-checks')
  bc.hidden = !fails.length
  bc.textContent = fails.length
  $('#last-run').textContent = `Last checked ${when(r.time)}`
}

function pill (color, ic, text) {
  const p = el('span', `pill ${color}`)
  p.append(icon(ic), el('span', null, text))
  return p
}

function renderTrend (trend) {
  const svg = $('#trend')
  svg.replaceChildren()
  const pts = trend || []
  svg.toggleAttribute('hidden', pts.length < 2)
  if (pts.length < 2) {
    $('#trend-label').textContent = ''
    return
  }
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 120, 34 - (p.score / 100) * 32])
  const line = xy.map(p => p.join(',')).join(' ')
  svg.append(svgEl('polyline', { points: line }))
  const [lx, ly] = xy[xy.length - 1]
  svg.append(svgEl('circle', { cx: lx, cy: ly, r: 2.5 }))
  const delta = pts[pts.length - 1].score - pts[pts.length - 2].score
  $('#trend-label').textContent = delta === 0 ? 'Same as last time' : `${delta > 0 ? '+' : ''}${delta} since last time`
}

function renderDrift (drift) {
  const banner = $('#drift-banner')
  const badge = $('#badge-changes')
  const changes = (drift && drift.changes) || []
  banner.hidden = !changes.length
  badge.hidden = !changes.length
  badge.textContent = changes.length
  badge.classList.add('neutral')
  if (changes.length) {
    $('#drift-banner-text').textContent = `${plural(changes.length, 'thing')} changed since your known-good checkup on ${new Date(drift.since).toLocaleDateString()}.`
  }

  const list = $('#drift-list')
  list.replaceChildren()
  $('#accept').hidden = !changes.length
  if (!drift) return
  if (drift.error) {
    $('#drift-title').textContent = "Couldn't compare"
    $('#drift-sub').textContent = cap(drift.error)
    return
  }
  if (drift.first) {
    $('#drift-title').textContent = 'Known-good checkup saved'
    $('#drift-sub').textContent = 'This checkup is now the one later checkups are compared with. Run another one later to see what changed.'
    return
  }
  if (!changes.length) {
    $('#drift-title').textContent = 'Nothing changed'
    $('#drift-sub').textContent = `Everything matches your known-good checkup from ${fullDate(drift.since)}.`
    return
  }
  $('#drift-title').textContent = `${plural(changes.length, 'change')} since ${new Date(drift.since).toLocaleDateString()}`
  $('#drift-sub').textContent = 'If you made these changes yourself, mark them as fine. Otherwise take a closer look.'
  for (const c of changes) {
    const li = el('li', c.kind)
    li.append(el('span', 'sign', c.sign), el('span', null, cap(c.text)), el('span', 'where', c.title))
    list.append(li)
  }
}

// one row per issue, the whole row opens the check
function renderTopFixes (fails) {
  const box = $('#top-fixes')
  box.replaceChildren()
  $('#see-all').hidden = fails.length <= 3
  if (!fails.length) {
    const ok = el('div', 'all-good')
    const ic = el('span', 'sev-icon green')
    ic.append(icon('check'))
    ok.append(ic, el('div', null, 'Nothing to fix right now. Nice work.'))
    box.append(ok)
    return
  }
  for (const r of fails.slice(0, 3)) {
    const row = el('button', 'fix-row')
    const sev = el('span', `sev-icon ${r.severity === 'critical' || r.severity === 'high' ? 'red' : 'yellow'}`)
    sev.append(icon('alert'))
    const text = el('span', 'fix-text')
    text.append(el('span', 'fix-title', r.title), el('span', 'fix-detail', cap(r.detail)))
    row.append(sev, text)
    if (r.settings) row.append(settingsButton(r.id, 'btn small'))
    row.append(icon('chevron'))
    row.addEventListener('click', () => reveal(r.id))
    box.append(row)
  }
}

function settingsButton (id, cls = 'btn small') {
  return button(cls, 'external', 'Open settings', async () => {
    const ok = await window.checkup.openSettings(id)
    if (!ok) toast("Couldn't open settings on this computer", null, 'error')
  })
}

function renderAreas (results) {
  const box = $('#areas')
  box.replaceChildren()
  for (const [key, a] of Object.entries(AREAS)) {
    const mine = results.filter(r => r.category === key)
    if (!mine.length) continue
    const fails = mine.filter(needsFix).length
    const scored = mine.filter(r => !r.ignored && (r.state === 'pass' || r.state === 'fail')).length
    const passed = scored - fails

    const tile = el('button', 'area')
    const top = el('div', 'area-top')
    const ic = el('span', 'area-icon')
    ic.append(icon(a.icon))
    top.append(ic, el('span', 'area-name', a.name))
    const bar = el('div', 'bar')
    const fill = el('span')
    fill.style.width = `${scored ? (passed / scored) * 100 : 0}%`
    if (fails) fill.className = fails > 1 ? 'red' : 'yellow'
    bar.append(fill)
    tile.append(top, el('p', `area-state ${fails ? (fails > 1 ? 'red' : 'yellow') : 'green'}`, fails ? plural(fails, 'issue') : 'All good'), bar)
    tile.addEventListener('click', () => {
      state.area = key
      state.filter = 'all'
      show('checks')
      renderChecks()
    })
    box.append(tile)
  }
}

// checks page

function matchesQuery (r, q) {
  if (!q) return true
  const hay = [r.title, r.detail, r.why, ...(r.items || []).map(i => i.text)].join(' ').toLowerCase()
  return q.split(/\s+/).every(w => hay.includes(w))
}

function renderChecks () {
  const r = state.report
  const groups = $('#check-groups')
  groups.replaceChildren()
  $('#checks-empty').hidden = !!r
  const anyIgnored = !!r && r.results.some(x => shownState(x) === 'ignored')
  $('#filter-ignored').hidden = !anyIgnored
  if (state.filter === 'ignored' && !anyIgnored) state.filter = 'all'
  for (const b of $$('.segmented[role=tablist] button')) b.classList.toggle('on', b.dataset.filter === state.filter)
  renderChips()
  if (!r) return

  const q = state.query.trim().toLowerCase()
  const keep = {
    all: () => true,
    attention: x => needsFix(x),
    passed: x => x.state === 'pass',
    ignored: x => shownState(x) === 'ignored'
  }[state.filter] || (() => true)
  const shown = r.results.filter(x => (state.area === 'all' || x.category === state.area) && keep(x) && matchesQuery(x, q))

  if (!shown.length) {
    const empty = el('div', 'empty card')
    const text = q ? `No checks match "${state.query.trim()}".` : state.filter === 'attention' ? 'Nothing needs attention here.' : 'Nothing to show.'
    empty.append(icon(q ? 'search' : state.filter === 'attention' ? 'check' : 'list'), el('p', null, text))
    groups.append(empty)
    return
  }

  for (const [key, a] of Object.entries(AREAS)) {
    const mine = shown.filter(x => x.category === key)
    if (!mine.length) continue
    const g = el('section', 'group')
    const head = el('div', 'group-head')
    const issues = mine.filter(needsFix).length
    head.append(icon(a.icon), el('h3', null, a.name), el('span', 'count', issues ? `${plural(issues, 'issue')} · ${mine.length} checks` : plural(mine.length, 'check')))
    const list = el('ul', 'list card')
    for (const res of mine) list.append(checkItem(res))
    g.append(head, list)
    groups.append(g)
  }
}

function renderChips () {
  const box = $('#area-chips')
  box.replaceChildren()
  const present = state.report ? new Set(state.report.results.map(r => r.category)) : new Set()
  const keys = ['all', ...Object.keys(AREAS).filter(k => present.has(k))]
  box.hidden = keys.length < 2
  for (const k of keys) {
    const c = el('button', `chip${state.area === k ? ' on' : ''}`, k === 'all' ? 'All areas' : AREAS[k].name)
    c.addEventListener('click', () => { state.area = k; renderChecks() })
    box.append(c)
  }
}

function checkItem (r) {
  const shown = shownState(r)
  const s = STATE[shown] || STATE.unknown
  const li = el('li', `item ${shown}${state.open.has(r.id) ? ' open' : ''}`)
  li.dataset.id = r.id

  const row = el('button', 'row')
  row.setAttribute('aria-expanded', state.open.has(r.id))
  const dot = el('span', `status ${s.color}`)
  dot.title = s.label
  dot.append(icon(s.icon))
  const text = el('span', 'row-text')
  text.append(el('span', 'name', r.title), el('span', 'peek', shown === 'ignored' ? `Ignored · ${cap(r.detail)}` : cap(r.detail)))
  row.append(dot, text, el('span', `sev ${r.severity}`, SEV[r.severity] || r.severity), el('span', 'chev'))
  row.addEventListener('click', () => {
    const open = li.classList.toggle('open')
    row.setAttribute('aria-expanded', open)
    if (open) state.open.add(r.id)
    else state.open.delete(r.id)
  })

  const more = el('div', 'more')
  const inner = el('div', 'more-inner')
  const body = el('div', 'more-body')

  body.append(el('p', 'found', cap(r.detail)))
  if (r.items && r.items.length) body.append(things(r.items))

  if (r.why) {
    const why = el('p', 'why')
    why.append(icon('bulb'), el('span', null, cap(r.why)))
    body.append(why)
  }

  const fixable = r.state !== 'pass' && r.fix && r.fix.length
  if (fixable) {
    const fix = el('div')
    fix.append(el('p', 'label', 'How to fix'))
    const ol = el('ol', 'steps')
    for (const step of r.fix) ol.append(el('li', null, cap(step)))
    fix.append(ol)
    body.append(fix)
  }

  // actions: open settings, check again, copy steps, ignore
  const foot = el('div', 'body-foot')
  const left = el('div', 'btn-row')
  if (r.settings && r.state !== 'pass') left.append(settingsButton(r.id, 'btn small primary'))
  if (r.state !== 'pass') left.append(button('btn small', 'refresh', 'Check again', b => recheck(r.id, b)))
  if (fixable) left.append(button('btn small ghost', 'copy', 'Copy steps', () => copySteps(r)))
  const right = el('div', 'btn-row')
  if (r.ignored) right.append(button('link', null, 'Stop ignoring', () => setIgnored(r.id, false)))
  else if (r.state !== 'pass') right.append(button('link muted-link', null, 'Ignore this check', () => setIgnored(r.id, true)))
  if (r.benchmark) right.append(el('span', 'bench', r.benchmark))
  foot.append(left, right)
  body.append(foot)

  inner.append(body)
  more.append(inner)
  li.append(row, more)
  return li
}

// long lists start short, flagged things first
function things (items) {
  const wrap = el('div')
  const sorted = [...items].sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0))
  const LIMIT = 6
  const ul = el('ul', 'things')
  const draw = all => {
    ul.replaceChildren()
    for (const it of all ? sorted : sorted.slice(0, LIMIT)) {
      const li = el('li', it.flag ? 'flag' : '')
      li.append(el('span', 'mark'), el('span', 't', it.text))
      if (it.note) li.append(el('span', 'n', cap(it.note)))
      ul.append(li)
    }
  }
  draw(false)
  wrap.append(ul)
  if (sorted.length > LIMIT) {
    const btn = el('button', 'link show-more', `Show all ${sorted.length}`)
    btn.addEventListener('click', () => { draw(true); btn.remove() })
    wrap.append(btn)
  }
  return wrap
}

// jump from the overview to one check, opened
function reveal (id) {
  state.filter = 'all'
  state.area = 'all'
  state.query = ''
  $('#search').value = ''
  state.open.add(id)
  show('checks')
  renderChecks()
  const li = $(`.item[data-id="${CSS.escape(id)}"]`)
  if (!li) return
  li.scrollIntoView({ block: 'center' })
  li.classList.add('flash')
  setTimeout(() => li.classList.remove('flash'), 1300)
}

// actions on one check

async function recheck (id, btn) {
  const before = state.report.results.find(x => x.id === id)
  btn.disabled = true
  btn.classList.add('busy')
  btn.querySelector('span').textContent = 'Checking…'
  try {
    const report = await window.checkup.recheck(id)
    if (!report) throw new Error('not available')
    state.report = report
    const after = report.results.find(x => x.id === id)
    render({ animate: false })
    if (after.state === 'pass') toast(`${after.title} is fixed`)
    else if (before && before.detail !== after.detail) toast(`${after.title}: ${after.detail}`, null, 'info')
    else toast(`${after.title} still needs fixing`, null, 'info')
  } catch {
    toast("Couldn't check again", null, 'error')
    btn.disabled = false
    btn.classList.remove('busy')
  }
}

async function setIgnored (id, on) {
  const res = await window.checkup.ignore(id, on)
  if (!res) return
  state.settings = res.settings
  if (res.report) {
    state.report = res.report
    render({ animate: false })
  }
  if (state.view === 'settings') renderSettings()
  const title = (res.settings.ignored[id] || {}).title || 'Check'
  if (on) toast(`${title} is ignored`, { label: 'Undo', run: () => setIgnored(id, false) }, 'info')
  else toast('Check counts toward your score again')
}

async function copySteps (r) {
  const text = `${r.title}\n${r.fix.map((s, i) => `${i + 1}. ${cap(s)}`).join('\n')}`
  try {
    await navigator.clipboard.writeText(text)
    toast('Steps copied')
  } catch {
    toast("Couldn't copy", null, 'error')
  }
}

// history page

async function renderHistory () {
  const list = await window.checkup.history()
  const rows = $('#history-rows')
  rows.replaceChildren()
  if (!list.length) {
    const tr = el('tr', 'empty-row')
    const td = el('td', null, 'No checkups yet.')
    td.colSpan = 3
    tr.append(td)
    rows.append(tr)
  }
  for (const s of list) {
    const tr = el('tr')
    const sc = el('td')
    sc.append(el('span', `pill ${scoreColor(s.score)}`, s.score ?? '–'))
    tr.append(el('td', null, fullDate(s.time)), sc, el('td', s.fails ? '' : 'muted', s.fails ? plural(s.fails, 'issue') : 'None'))
    rows.append(tr)
  }
  drawChart([...list].reverse().filter(s => s.score != null).slice(-30))
}

function drawChart (pts) {
  const svg = $('#chart')
  svg.replaceChildren()
  svg.toggleAttribute('hidden', pts.length < 2)
  $('#chart-empty').hidden = pts.length >= 2
  if (pts.length < 2) return

  const W = 640
  const H = 200
  const L = 32
  const B = 24
  const y = v => 8 + (H - B - 8) * (1 - v / 100)
  const x = i => L + (W - L - 8) * (i / (pts.length - 1))

  for (const v of [0, 50, 100]) {
    svg.append(svgEl('line', { class: 'grid', x1: L, x2: W, y1: y(v), y2: y(v) }))
    const t = svgEl('text', { class: 'axis', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' })
    t.textContent = v
    svg.append(t)
  }
  const line = pts.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')
  svg.append(svgEl('polygon', { class: 'area', points: `${x(0)},${y(0)} ${line} ${x(pts.length - 1)},${y(0)}` }))
  svg.append(svgEl('polyline', { class: 'line', points: line }))
  pts.forEach((p, i) => {
    const c = svgEl('circle', { cx: x(i), cy: y(p.score), r: 3.5 })
    const tip = svgEl('title', {})
    tip.textContent = `${fullDate(p.time)}: ${p.score}`
    c.append(tip)
    svg.append(c)
  })
  for (const i of [0, pts.length - 1]) {
    const t = svgEl('text', { class: 'axis', x: x(i), y: H - 4, 'text-anchor': i ? 'end' : 'start' })
    t.textContent = new Date(pts[i].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    svg.append(t)
  }
}

// settings page

function renderSettings () {
  const s = state.settings
  if (!s) return
  for (const b of $$('#theme button')) b.classList.toggle('on', b.dataset.theme === s.theme)
  for (const b of $$('#remind button')) b.classList.toggle('on', Number(b.dataset.remind) === s.remindDays)

  const list = $('#ignored-list')
  list.replaceChildren()
  const entries = Object.entries(s.ignored)
  list.hidden = !entries.length
  $('#ignored-empty').hidden = !!entries.length
  for (const [id, v] of entries) {
    const li = el('li')
    li.append(el('span', 'mark'), el('span', 't', v.title || id), el('span', 'n', `since ${new Date(v.time).toLocaleDateString()}`))
    li.append(button('link', null, 'Stop ignoring', () => setIgnored(id, false)))
    list.append(li)
  }
}

async function saveSetting (patch) {
  state.settings = await window.checkup.setSettings(patch)
  renderSettings()
  updateReminder()
}

// a quiet note on the welcome card when the last checkup is old
function updateReminder () {
  const note = $('#welcome-last')
  const last = state.info && state.info.lastTime
  if (!last) { note.hidden = true; return }
  const days = state.settings ? state.settings.remindDays : 0
  const due = days > 0 && daysSince(last) >= days
  note.hidden = false
  note.classList.toggle('due', due)
  note.textContent = due
    ? `Your last checkup was ${when(last)}. Time for a new one.`
    : `Your last checkup was ${when(last)}.`
}

// motion: springs that start from where things are now and keep their speed

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')

// damping 1 = no bounce, response = seconds to get there (not a fixed duration)
function spring (from, to, { velocity = 0, damping = 1, response = 0.35, onUpdate, onDone }) {
  const k = (2 * Math.PI / response) ** 2
  const c = 4 * Math.PI * damping / response
  let x = from
  let v = velocity
  let last = performance.now()
  let raf = 0
  const step = now => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    v += (-k * (x - to) - c * v) * dt
    x += v * dt
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 5) {
      onUpdate(to)
      if (onDone) onDone()
      return
    }
    onUpdate(x)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

// where a flick would come to rest, same curve as scrolling
const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate)

// past the edge it follows less and less
const rubberband = (over, size, c = 0.55) => (over * size * c) / (size + c * Math.abs(over))

// toasts slide in from the right and leave the same way, swipe right to dismiss

function toast (text, action, kind = 'ok') {
  const t = el('div', `toast ${kind}`)
  t.append(icon(kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check'), el('span', null, text))
  if (action) {
    const b = el('button', null, action.label)
    b.addEventListener('click', () => { dismiss(t); action.run() })
    t.append(b)
  }
  $('#toasts').append(t)

  t._x = 0
  t._stop = () => {}
  const width = () => t.offsetWidth + 40
  const setX = x => {
    t._x = x
    t.style.transform = `translateX(${x}px)`
    t.style.opacity = x > 0 ? Math.max(0, 1 - x / width()) : 1
  }
  t._setX = setX
  t._width = width

  if (reduceMotion.matches) {
    t.style.opacity = 0
    t.style.transition = 'opacity .2s ease'
    requestAnimationFrame(() => { t.style.opacity = 1 })
  } else {
    setX(width())
    t._stop = spring(t._x, 0, { response: 0.4, onUpdate: setX })
  }

  // pause while the pointer is on it
  let timer = setTimeout(() => dismiss(t), 5000)
  t.addEventListener('pointerenter', () => clearTimeout(timer))
  t.addEventListener('pointerleave', () => { if (!t._dragging) timer = setTimeout(() => dismiss(t), 2500) })

  let grab = 0
  let trail = []
  t.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button') || reduceMotion.matches) return
    t._stop() // grab it mid-flight, from where it is now
    t.setPointerCapture(e.pointerId)
    t._dragging = true
    t.classList.add('dragging')
    grab = e.clientX - t._x
    trail = [{ x: t._x, at: e.timeStamp }]
  })
  t.addEventListener('pointermove', e => {
    if (!t._dragging) return
    const raw = e.clientX - grab
    setX(raw < 0 ? -rubberband(-raw, width()) : raw)
    trail.push({ x: t._x, at: e.timeStamp })
    if (trail.length > 6) trail.shift()
  })
  const release = e => {
    if (!t._dragging) return
    t._dragging = false
    t.classList.remove('dragging')
    const first = trail[0]
    const dt = (e.timeStamp - first.at) / 1000
    const v = dt > 0 ? (t._x - first.x) / dt : 0
    // decide from where the flick is heading, not where it let go
    if (t._x + project(v) > width() / 2) dismiss(t, v)
    else {
      t._stop = spring(t._x, 0, { velocity: v, damping: Math.abs(v) > 200 ? 0.8 : 1, response: 0.35, onUpdate: setX })
      timer = setTimeout(() => dismiss(t), 2500)
    }
  }
  t.addEventListener('pointerup', release)
  t.addEventListener('pointercancel', release)
}

function dismiss (t, velocity = 0) {
  if (!t.isConnected || t._leaving) return
  t._leaving = true
  t._stop()
  if (reduceMotion.matches || !t._setX) {
    t.style.transition = 'opacity .2s ease'
    t.style.opacity = 0
    setTimeout(() => t.remove(), 200)
    return
  }
  spring(t._x, t._width(), { velocity: Math.max(velocity, 0), response: 0.3, onUpdate: t._setX, onDone: () => t.remove() })
}

// export menu

const menu = $('#export-menu')
function setMenu (open) {
  menu.hidden = !open
  $('#export').setAttribute('aria-expanded', open)
}
$('#export').addEventListener('click', e => { e.stopPropagation(); setMenu(menu.hidden) })
document.addEventListener('click', () => setMenu(false))
for (const b of $$('[data-save]')) {
  b.addEventListener('click', async () => {
    setMenu(false)
    const name = await window.checkup.save(b.dataset.save)
    if (name) toast(`Saved ${name}`, { label: 'Show', run: () => window.checkup.reveal() })
  })
}

// wiring

for (const b of $$('.nav-item')) {
  b.addEventListener('pointerdown', e => { if (e.button === 0) show(b.dataset.view) })
  b.addEventListener('click', e => { if (e.detail === 0) show(b.dataset.view) })
}

// a hairline under the top bar only once content scrolls beneath it
$('#main').addEventListener('scroll', e => {
  $('.content').classList.toggle('scrolled', e.target.scrollTop > 2)
}, { passive: true })
for (const b of $$('[data-go]')) {
  b.addEventListener('click', () => {
    if (b.dataset.filter) { state.filter = b.dataset.filter; state.area = 'all' }
    show(b.dataset.go)
    if (b.dataset.go === 'checks') renderChecks()
  })
}
for (const b of $$('.segmented[role=tablist] button')) {
  b.addEventListener('click', () => { state.filter = b.dataset.filter; renderChecks() })
}
$('#search').addEventListener('input', e => { state.query = e.target.value; renderChecks() })
$('#search').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; state.query = ''; renderChecks() } })
for (const b of $$('#theme button')) b.addEventListener('click', () => saveSetting({ theme: b.dataset.theme }))
for (const b of $$('#remind button')) b.addEventListener('click', () => saveSetting({ remindDays: Number(b.dataset.remind) }))

$('#scan').addEventListener('click', scan)
for (const b of $$('[data-action="scan"]')) b.addEventListener('click', scan)

$('#accept').addEventListener('click', async () => {
  const since = await window.checkup.accept()
  if (!since || !state.report) return
  state.report.drift = { ...state.report.drift, since, changes: [], first: false }
  renderDrift(state.report.drift)
  toast('Saved as your known-good checkup')
})

$('#reset').addEventListener('click', async () => {
  if (!(await window.checkup.reset())) return
  if (state.report) state.report.drift = null
  if (state.info) state.info.lastTime = null
  renderTrend([])
  renderDrift(null)
  updateReminder()
  $('#drift-title').textContent = 'No checkup yet'
  $('#drift-sub').textContent = 'After your next checkup, this page shows anything that changes on your computer.'
  toast('History cleared')
})

$('#open-data').addEventListener('click', () => window.checkup.openData())

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setMenu(false)
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
  const key = e.key.toLowerCase()
  if (key === 'r') { e.preventDefault(); scan() }
  if (key === 'f') {
    e.preventDefault()
    show('checks')
    renderChecks()
    $('#search').focus()
    $('#search').select()
  }
  const n = Number(e.key)
  if (n >= 1 && n <= 5) { e.preventDefault(); show(Object.keys(PAGES)[n - 1]) }
})

// refresh "x min ago" now and then
setInterval(() => {
  if (state.report) $('#last-run').textContent = `Last checked ${when(state.report.time)}`
  updateReminder()
}, 60000)

async function init () {
  fillIcons()
  renderChecks()
  const info = await window.checkup.info()
  state.info = info
  state.settings = info.settings
  const osName = { macos: 'macOS', windows: 'Windows', linux: 'Linux' }[info.os] || info.os
  $('#brand-sub').textContent = `For ${osName}`
  $('#machine').textContent = info.host
  $('#machine').title = info.host
  $('#version').textContent = info.version
  $('#check-count').textContent = info.checks
  if (info.mac) {
    document.body.classList.add('mac', 'vibrant')
    for (const k of $$('kbd.mod')) k.textContent = '⌘'
  }
  if (info.lastTime) {
    $('#last-run').textContent = `Last checked ${when(info.lastTime)}`
    $('[data-action="scan"]').textContent = 'Run a checkup'
  }
  updateReminder()
}

init()
