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
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
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
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z'
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
  fail: { color: 'red', icon: 'x', label: 'Fix' },
  unknown: { color: 'gray', icon: 'dash', label: "Couldn't check" },
  info: { color: 'gray', icon: 'info', label: 'Note' }
}
const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const PAGES = {
  overview: ['Overview', 'How secure this computer is right now'],
  checks: ['Checks', 'Every check, what was found and how to fix it'],
  changes: ['Changes', 'What changed since your known-good checkup'],
  history: ['History', 'Your score over time'],
  about: ['About & privacy', 'What this app reads and what it sends']
}

const state = { info: null, report: null, view: 'overview', filter: 'all', area: 'all', open: new Set(), scanning: false }

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
}

// formatting

function when (iso) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
const fullDate = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const scoreColor = s => s == null ? 'gray' : s >= 80 ? 'green' : s >= 50 ? 'yellow' : 'red'

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
    toast(`The checkup stopped: ${e.message}`)
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

function render () {
  const r = state.report
  if (!r) return
  const results = r.results
  const fails = results.filter(x => x.state === 'fail')
  const passes = results.filter(x => x.state === 'pass')
  const other = results.length - fails.length - passes.length

  $('#live').hidden = true
  $('#welcome').hidden = true
  $('#results').hidden = false
  $('#export').disabled = false

  // score ring
  const arc = $('#arc')
  const color = scoreColor(r.score)
  arc.setAttribute('class', `arc ${color}`)
  arc.style.strokeDashoffset = 175.9
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.style.strokeDashoffset = 175.9 * (1 - (r.score ?? 0) / 100)
  }))
  $('#score-num').textContent = r.score ?? '–'

  const [title, sub] = verdict(r.score, fails.length)
  $('#verdict').textContent = title
  $('#verdict-sub').textContent = sub

  const counts = $('#counts')
  counts.replaceChildren()
  if (fails.length) counts.append(pill('red', 'x', `${plural(fails.length, 'issue')} to fix`))
  counts.append(pill('green', 'check', `${passes.length} passed`))
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
    $('#trend-label').textContent = pts.length ? 'First checkup' : ''
    return
  }
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * 120, 34 - (p.score / 100) * 32])
  const line = xy.map(p => p.join(',')).join(' ')
  svg.append(svgEl('polygon', { class: 'area', points: `0,36 ${line} 120,36` }))
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

function renderTopFixes (fails) {
  const box = $('#top-fixes')
  box.replaceChildren()
  if (!fails.length) {
    const ok = el('div', 'card all-good')
    const ic = el('span', 'sev-icon green')
    ic.append(icon('check'))
    ok.append(ic, el('div', null, 'Nothing to fix right now. Nice work.'))
    box.append(ok)
    return
  }
  for (const r of fails.slice(0, 3)) {
    const card = el('div', 'card fix-card')
    const sev = el('span', `sev-icon ${r.severity === 'critical' || r.severity === 'high' ? 'red' : 'yellow'}`)
    sev.append(icon('alert'))
    const text = el('div')
    text.style.minWidth = '0'
    text.append(el('p', 'fix-title', r.title), el('p', 'fix-detail', cap(r.detail)))
    const btns = el('div', 'btn-row')
    if (r.settings) btns.append(settingsButton(r.id))
    const how = el('button', 'btn small', 'How to fix')
    how.addEventListener('click', () => reveal(r.id))
    btns.append(how)
    card.append(sev, text, btns)
    box.append(card)
  }
}

function settingsButton (id) {
  const b = el('button', 'btn small primary')
  b.append(icon('external'), el('span', null, 'Open settings'))
  b.addEventListener('click', async e => {
    e.stopPropagation()
    const ok = await window.checkup.openSettings(id)
    if (!ok) toast("Couldn't open settings on this computer")
  })
  return b
}

function renderAreas (results) {
  const box = $('#areas')
  box.replaceChildren()
  for (const [key, a] of Object.entries(AREAS)) {
    const mine = results.filter(r => r.category === key)
    if (!mine.length) continue
    const fails = mine.filter(r => r.state === 'fail').length
    const scored = mine.filter(r => r.state === 'pass' || r.state === 'fail').length
    const passed = scored - fails

    const tile = el('button', 'card area')
    const top = el('div', 'area-top')
    const ic = el('span', 'area-icon')
    ic.append(icon(a.icon))
    const st = el('span', `area-state ${fails ? (fails > 1 ? 'red' : 'yellow') : 'green'}`, fails ? plural(fails, 'issue') : 'All good')
    top.append(ic, st)
    const bar = el('div', 'bar')
    const fill = el('span')
    fill.style.width = `${scored ? (passed / scored) * 100 : 0}%`
    bar.append(fill)
    tile.append(top, el('p', 'area-name', a.name), el('p', 'muted small', `${passed} of ${scored} passed`), bar)
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

function renderChecks () {
  const r = state.report
  const groups = $('#check-groups')
  groups.replaceChildren()
  $('#checks-empty').hidden = !!r
  for (const b of $$('.segmented button')) b.classList.toggle('on', b.dataset.filter === state.filter)
  renderChips()
  if (!r) return

  const shown = r.results.filter(x =>
    (state.area === 'all' || x.category === state.area) &&
    (state.filter === 'all' || (state.filter === 'attention' ? x.state === 'fail' : x.state === 'pass')))

  if (!shown.length) {
    const empty = el('div', 'empty card')
    empty.append(icon(state.filter === 'attention' ? 'check' : 'list'), el('p', null, state.filter === 'attention' ? 'Nothing needs attention here.' : 'Nothing to show.'))
    groups.append(empty)
    return
  }

  for (const [key, a] of Object.entries(AREAS)) {
    const mine = shown.filter(x => x.category === key)
    if (!mine.length) continue
    const g = el('section', 'group')
    const head = el('div', 'group-head')
    const issues = mine.filter(x => x.state === 'fail').length
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
  if (keys.length < 2) return
  for (const k of keys) {
    const c = el('button', `chip${state.area === k ? ' on' : ''}`, k === 'all' ? 'All areas' : AREAS[k].name)
    c.addEventListener('click', () => { state.area = k; renderChecks() })
    box.append(c)
  }
}

function checkItem (r) {
  const s = STATE[r.state] || STATE.unknown
  const li = el('li', `item${r.state === 'pass' ? ' passed' : ''}${state.open.has(r.id) ? ' open' : ''}`)
  li.dataset.id = r.id

  const row = el('button', 'row')
  row.setAttribute('aria-expanded', state.open.has(r.id))
  const dot = el('span', `status ${s.color}`)
  dot.title = s.label
  dot.append(icon(s.icon))
  const text = el('span', 'row-text')
  text.append(el('span', 'name', r.title), el('span', 'peek', cap(r.detail)))
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

  if (r.state !== 'pass' && r.fix && r.fix.length) {
    const fix = el('div')
    fix.append(el('p', 'label', 'How to fix'))
    const ol = el('ol', 'steps')
    for (const step of r.fix) ol.append(el('li', null, cap(step)))
    fix.append(ol)
    body.append(fix)
  }

  const foot = el('div', 'body-foot')
  const left = el('div', 'btn-row')
  if (r.settings && r.state !== 'pass') left.append(settingsButton(r.id))
  foot.append(left)
  if (r.benchmark) foot.append(el('span', 'bench', r.benchmark))
  if (left.childNodes.length || r.benchmark) body.append(foot)

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
  state.open.add(id)
  show('checks')
  renderChecks()
  const li = $(`.item[data-id="${CSS.escape(id)}"]`)
  if (!li) return
  li.scrollIntoView({ block: 'center' })
  li.classList.add('flash')
  setTimeout(() => li.classList.remove('flash'), 1300)
}

// history page

async function renderHistory () {
  const list = await window.checkup.history()
  const rows = $('#history-rows')
  rows.replaceChildren()
  $('#reset').hidden = !list.length
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

// toasts

function toast (text, action) {
  const t = el('div', 'toast')
  t.append(icon('check'), el('span', null, text))
  if (action) {
    const b = el('button', null, action.label)
    b.addEventListener('click', action.run)
    t.append(b)
  }
  $('#toasts').append(t)
  setTimeout(() => t.remove(), 5000)
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

for (const b of $$('.nav-item')) b.addEventListener('click', () => show(b.dataset.view))
for (const b of $$('[data-go]')) {
  b.addEventListener('click', () => {
    if (b.dataset.filter) { state.filter = b.dataset.filter; state.area = 'all' }
    show(b.dataset.go)
    if (b.dataset.go === 'checks') renderChecks()
  })
}
for (const b of $$('.segmented button')) {
  b.addEventListener('click', () => { state.filter = b.dataset.filter; renderChecks() })
}
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
  renderHistory()
  renderTrend([])
  renderDrift(null)
  $('#drift-title').textContent = 'No checkup yet'
  $('#drift-sub').textContent = 'After your next checkup, this page shows anything that changes on your computer.'
  toast('History cleared')
})

$('#open-data').addEventListener('click', () => window.checkup.openData())

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setMenu(false)
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
  if (e.key === 'r') { e.preventDefault(); scan() }
  const n = Number(e.key)
  if (n >= 1 && n <= 5) { e.preventDefault(); show(Object.keys(PAGES)[n - 1]) }
})

// refresh "x min ago" now and then
setInterval(() => { if (state.report) $('#last-run').textContent = `Last checked ${when(state.report.time)}` }, 60000)

async function init () {
  fillIcons()
  renderChecks()
  const info = await window.checkup.info()
  state.info = info
  const osName = { macos: 'macOS', windows: 'Windows', linux: 'Linux' }[info.os] || info.os
  $('#brand-sub').textContent = `For ${osName}`
  $('#machine').textContent = info.host
  $('#machine').title = info.host
  $('#version').textContent = info.version
  $('#check-count').textContent = info.checks
  if (info.mac) {
    document.body.classList.add('mac')
    for (const k of $$('kbd.mod')) k.textContent = '⌘'
  }
  if (info.hasHistory) {
    $('#last-run').textContent = 'Run a checkup to see results'
    $('[data-action="scan"]').textContent = 'Run a checkup'
  }
}

init()
