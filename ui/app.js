const $ = s => document.querySelector(s)
const RING = 175.9 // 2 * pi * r (r = 28)
const SHOW = 6 // found things shown before "show all"

// build elements with textContent only, never innerHTML
function el (tag, cls, text) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

function scoreColor (s) {
  if (s == null) return ''
  return s >= 80 ? 'green' : s >= 50 ? 'yellow' : 'red'
}

function dotColor (r) {
  if (r.state === 'pass') return 'green'
  if (r.state !== 'fail') return ''
  return r.severity === 'critical' || r.severity === 'high' ? 'red' : 'yellow'
}

function verdict (s) {
  if (s == null) return 'could not score this computer'
  if (s >= 90) return 'looking great'
  if (s >= 80) return 'looking good'
  if (s >= 50) return 'a few things to fix'
  return 'needs attention'
}

function tagText (r) {
  if (r.state === 'unknown') return 'unknown'
  if (r.state === 'info') return 'note'
  return r.severity
}

// list of apps / add-ons / accounts a check found
function renderThings (items) {
  const wrap = el('div')
  const ul = el('ul', 'things')
  const make = it => {
    const li = el('li', it.flag ? 'flag' : '')
    li.append(el('span', 'mark'), el('span', 't', it.text))
    if (it.note) li.append(el('span', 'n', it.note))
    return li
  }
  items.slice(0, SHOW).forEach(it => ul.append(make(it)))
  wrap.append(ul)

  if (items.length > SHOW) {
    const more = el('button', 'link show-more', `show all ${items.length}`)
    more.addEventListener('click', () => {
      items.slice(SHOW).forEach(it => ul.append(make(it)))
      more.remove()
    })
    wrap.append(more)
  }
  return wrap
}

function renderItem (r) {
  const li = el('li', 'item')
  const row = el('button', 'row')
  row.setAttribute('aria-expanded', 'false')
  row.append(
    el('span', `dot ${dotColor(r)}`),
    el('span', 'name', r.title),
    el('span', 'peek', r.detail),
    el('span', 'tag', tagText(r)),
    el('span', 'chev')
  )

  const body = el('div', 'more-body')
  body.append(el('p', 'found', r.detail))
  if (r.items && r.items.length) body.append(renderThings(r.items))
  if (r.why) body.append(el('p', 'why', r.why))
  if (r.state !== 'pass' && r.fix.length) {
    body.append(el('p', 'label', 'how to fix'))
    const ol = el('ol')
    r.fix.forEach(step => ol.append(el('li', null, step)))
    body.append(ol)
  }
  if (r.benchmark) body.append(el('p', 'bench', r.benchmark))

  const inner = el('div', 'more-inner')
  inner.append(body)
  const more = el('div', 'more')
  more.append(inner)

  row.addEventListener('click', () => setOpen(li, !li.classList.contains('open')))
  li.append(row, more)
  return li
}

function setOpen (li, open) {
  li.classList.toggle('open', open)
  li.querySelector('.row').setAttribute('aria-expanded', String(open))
}

function countChip (n, color, label) {
  const s = el('span')
  s.append(el('span', `dot ${color}`), document.createTextNode(`${n} ${label}`))
  return s
}

function render (report) {
  const ok = report.results.filter(r => r.state === 'pass')
  const todo = report.results.filter(r => r.state !== 'pass')
  const fails = todo.filter(r => r.state === 'fail')
  const other = todo.length - fails.length

  const arc = $('#arc')
  arc.setAttribute('class', `arc ${scoreColor(report.score)}`)
  arc.style.strokeDashoffset = RING
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = RING * (1 - (report.score ?? 0) / 100) }))
  $('#score-num').textContent = report.score ?? '–'
  $('#verdict').textContent = verdict(report.score)
  $('#counts').replaceChildren(
    countChip(ok.length, 'green', 'ok'),
    countChip(fails.length, 'red', 'to fix'),
    ...(other ? [countChip(other, '', 'other')] : [])
  )

  // results come sorted worst first, so the first fail is the one to start with
  const first = $('#first')
  first.replaceChildren()
  if (fails.length) first.append(document.createTextNode('fix first: '), el('b', null, fails[0].title))

  $('#when').textContent = `checked ${new Date(report.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  $('#summary').hidden = false

  $('#fix-list').replaceChildren(...todo.map(r => {
    const li = renderItem(r)
    if (r.state === 'fail') setOpen(li, true)
    return li
  }))
  $('#ok-list').replaceChildren(...ok.map(renderItem))
  $('#fix-count').textContent = todo.length
  $('#ok-count').textContent = ok.length
  $('#fix-group').hidden = !todo.length
  $('#ok-group').hidden = !ok.length
  $('#toggle-all').textContent = 'collapse all'
  $('#saved').replaceChildren()
  renderTrend((report.drift && report.drift.trend) || [])
  renderDrift(report.drift)
  window.scrollTo({ top: 0 })
}

const day = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })

// tiny line of past scores, newest on the right
function renderTrend (points) {
  // svg elements ignore .hidden, so use the attribute
  const svg = $('#trend')
  svg.toggleAttribute('hidden', points.length < 2)
  if (points.length < 2) return
  const ns = 'http://www.w3.org/2000/svg'
  const x = i => (i / (points.length - 1)) * 92 + 2
  const y = v => 26 - (v / 100) * 24
  const line = document.createElementNS(ns, 'polyline')
  line.setAttribute('points', points.map((p, i) => `${x(i)},${y(p.score)}`).join(' '))
  const end = document.createElementNS(ns, 'circle')
  end.setAttribute('cx', x(points.length - 1))
  end.setAttribute('cy', y(points[points.length - 1].score))
  end.setAttribute('r', 2.5)
  const title = document.createElementNS(ns, 'title')
  title.textContent = points.map(p => `${day(p.time)}: ${p.score}`).join('\n')
  svg.replaceChildren(title, line, end)
}

// what's different from the last "known good" checkup
function renderDrift (drift) {
  const card = $('#drift')
  card.hidden = !drift || !!drift.error
  if (card.hidden) return
  const list = $('#drift-list')
  list.replaceChildren()
  $('#accept').hidden = true

  if (drift.first) {
    $('#drift-title').textContent = 'first checkup saved'
    $('#drift-sub').textContent = "next time, you'll see anything that changed since today."
    return
  }
  if (!drift.changes.length) {
    $('#drift-title').textContent = 'nothing changed'
    $('#drift-sub').textContent = `same as your known-good checkup from ${day(drift.since)}.`
    return
  }

  const n = drift.changes.length
  $('#drift-title').textContent = `${n} change${n === 1 ? '' : 's'} since ${day(drift.since)}`
  $('#drift-sub').textContent = "new apps, add-ons or accounts you didn't add yourself are worth a look."
  $('#accept').hidden = false
  for (const c of drift.changes) {
    const li = el('li', c.kind)
    li.append(el('span', 'sign', c.sign), el('span', null, c.text), el('span', 'where', c.title))
    list.append(li)
  }
}

// live list while checks run
const live = { total: 0, done: 0 }

window.checkup.onProgress(p => {
  if (p.type === 'start') {
    live.total = p.checks.length
    live.done = 0
    $('#live-total').textContent = live.total
    $('#live-list').replaceChildren(...p.checks.map(c => {
      const li = el('li')
      li.dataset.id = c.id
      li.append(el('span', 'spinner'), el('span', null, c.title))
      return li
    }))
  } else if (p.type === 'done') {
    live.done++
    const li = [...$('#live-list').children].find(n => n.dataset.id === p.id)
    if (li) {
      li.classList.add('done')
      li.firstChild.replaceWith(el('span', `dot ${dotColor(p)}`))
    }
  }
  $('#live-count').textContent = live.done
  $('#progress-fill').style.width = `${live.total ? (live.done / live.total) * 100 : 0}%`
})

async function scan () {
  const btn = $('#scan')
  if (btn.disabled) return
  btn.disabled = true
  btn.classList.add('busy')
  $('#scan-label').textContent = 'checking…'
  $('#empty').hidden = true
  $('#summary').hidden = true
  $('#drift').hidden = true
  $('#fix-group').hidden = true
  $('#ok-group').hidden = true
  $('#live').hidden = false
  $('#progress').hidden = false
  $('#progress-fill').style.width = '0%'

  try {
    render(await window.checkup.scan())
  } catch (e) {
    $('#empty').hidden = false
    $('#empty').querySelector('.empty-title').textContent = 'something went wrong'
    $('#empty').querySelector('.muted').textContent = e.message
  }

  $('#live').hidden = true
  $('#progress').hidden = true
  btn.disabled = false
  btn.classList.remove('busy')
  $('#scan-label').textContent = 'run again'
}

$('#accept').addEventListener('click', async () => {
  const since = await window.checkup.accept()
  renderDrift({ since, changes: [] })
  $('#drift-title').textContent = 'saved as your new known-good checkup'
})

document.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
  const name = await window.checkup.save(b.dataset.save)
  if (!name) return
  const show = el('button', 'link', 'show in folder')
  show.addEventListener('click', () => window.checkup.reveal())
  $('#saved').replaceChildren(document.createTextNode(`saved ${name}`), show)
}))

$('#how-btn').addEventListener('click', () => {
  const how = $('#how')
  how.hidden = !how.hidden
  $('#how-btn').setAttribute('aria-expanded', String(!how.hidden))
})

$('#toggle-all').addEventListener('click', () => {
  const items = [...$('#fix-list').children]
  const open = items.some(li => li.classList.contains('open'))
  items.forEach(li => setOpen(li, !open))
  $('#toggle-all').textContent = open ? 'expand all' : 'collapse all'
})

// ctrl / cmd + r runs a checkup instead of reloading the page
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    scan()
  }
})

// thin line under the bar once you scroll
window.addEventListener('scroll', () => $('.bar').classList.toggle('scrolled', window.scrollY > 4), { passive: true })

window.checkup.info().then(i => { $('#machine').textContent = `${i.host} · ${i.os}` })
$('#scan').addEventListener('click', scan)
