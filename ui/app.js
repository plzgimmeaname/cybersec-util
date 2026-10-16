const $ = s => document.querySelector(s)

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
  if (r.state === 'unknown') return ''
  return r.severity === 'critical' || r.severity === 'high' ? 'red' : 'yellow'
}

function verdict (s) {
  if (s == null) return 'could not score this computer'
  if (s >= 80) return 'looking good'
  if (s >= 50) return 'a few things to fix'
  return 'needs attention'
}

function renderItem (r) {
  const li = el('li', 'item')
  const row = el('div', 'row')
  row.append(el('span', `dot ${dotColor(r)}`), el('span', 'name', r.title), el('span', 'tag', r.state === 'unknown' ? 'unknown' : r.severity))

  const more = el('div', 'more')
  more.append(el('p', null, r.detail))
  if (r.why) more.append(el('p', null, r.why))
  if (r.state !== 'pass' && r.fix.length) {
    more.append(el('p', 'label', 'how to fix'))
    const ol = el('ol')
    r.fix.forEach(step => ol.append(el('li', null, step)))
    more.append(ol)
  }
  if (r.benchmark) more.append(el('p', null, r.benchmark))

  row.addEventListener('click', () => li.classList.toggle('open'))
  li.append(row, more)
  return li
}

function render (report) {
  const pass = report.results.filter(r => r.state === 'pass').length
  const fail = report.results.filter(r => r.state === 'fail').length
  const unknown = report.results.length - pass - fail

  $('#score').className = `score ${scoreColor(report.score)}`
  $('#score-num').textContent = report.score ?? '–'
  $('#verdict').textContent = verdict(report.score)
  $('#counts').textContent = `${pass} ok · ${fail} to fix · ${unknown} unknown`
  $('#summary').hidden = false
  $('#empty').hidden = true

  const list = $('#results')
  list.replaceChildren(...report.results.map(renderItem))
  // open anything that failed so the fix is right there
  list.querySelectorAll('.item').forEach((li, i) => {
    if (report.results[i].state === 'fail') li.classList.add('open')
  })
}

async function scan () {
  const btn = $('#scan')
  btn.disabled = true
  btn.textContent = 'checking…'
  try {
    render(await window.checkup.scan())
  } catch (e) {
    $('#empty').hidden = false
    $('#empty').textContent = `something went wrong: ${e.message}`
  }
  btn.disabled = false
  btn.textContent = 'run again'
}

window.checkup.info().then(i => { $('#machine').textContent = `${i.host} · ${i.os}` })
$('#scan').addEventListener('click', scan)
