const $ = s => document.querySelector(s)
const RING = 175.9 // 2 * pi * r (r = 28)

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
  if (s >= 80) return 'looking good'
  if (s >= 50) return 'a few things to fix'
  return 'needs attention'
}

function tagText (r) {
  if (r.state === 'unknown') return 'unknown'
  if (r.state === 'info') return 'note'
  return r.severity
}

function renderItem (r) {
  const li = el('li', 'item')
  const row = el('div', 'row')
  row.append(el('span', `dot ${dotColor(r)}`), el('span', 'name', r.title), el('span', 'tag', tagText(r)), el('span', 'chev'))

  const body = el('div', 'more-body')
  body.append(el('p', 'found', r.detail))
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

  row.addEventListener('click', () => li.classList.toggle('open'))
  li.append(row, more)
  return li
}

function countChip (n, color, label) {
  const s = el('span')
  s.append(el('span', `dot ${color}`), document.createTextNode(`${n} ${label}`))
  return s
}

function render (report) {
  const ok = report.results.filter(r => r.state === 'pass')
  const todo = report.results.filter(r => r.state !== 'pass')
  const fails = todo.filter(r => r.state === 'fail').length
  const other = todo.length - fails

  const color = scoreColor(report.score)
  const arc = $('#arc')
  arc.setAttribute('class', `arc ${color}`)
  arc.style.strokeDashoffset = RING * (1 - (report.score ?? 0) / 100)
  $('#score-num').textContent = report.score ?? '–'
  $('#verdict').textContent = verdict(report.score)
  $('#counts').replaceChildren(
    countChip(ok.length, 'green', 'ok'),
    countChip(fails, 'red', 'to fix'),
    ...(other ? [countChip(other, '', 'other')] : [])
  )
  $('#when').textContent = `checked ${new Date(report.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  $('#summary').hidden = false
  $('#empty').hidden = true

  // failures open by default so the fix is right there
  $('#fix-list').replaceChildren(...todo.map(r => {
    const li = renderItem(r)
    if (r.state === 'fail') li.classList.add('open')
    return li
  }))
  $('#ok-list').replaceChildren(...ok.map(renderItem))
  $('#fix-count').textContent = todo.length
  $('#ok-count').textContent = ok.length
  $('#fix-group').hidden = !todo.length
  $('#ok-group').hidden = !ok.length
}

async function scan () {
  const btn = $('#scan')
  btn.disabled = true
  btn.classList.add('busy')
  $('#scan-label').textContent = 'checking…'
  // update checks talk to apple / microsoft / your distro, so it's slow
  if ($('#summary').hidden) $('#empty-text').textContent = 'checking for updates can take a minute or two.'
  try {
    render(await window.checkup.scan())
  } catch (e) {
    $('#empty').hidden = false
    $('#empty-text').textContent = `something went wrong: ${e.message}`
  }
  btn.disabled = false
  btn.classList.remove('busy')
  $('#scan-label').textContent = 'run again'
}

window.checkup.info().then(i => { $('#machine').textContent = `${i.host} · ${i.os}` })
$('#scan').addEventListener('click', scan)
