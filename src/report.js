// turns a scan into a file you can keep or share
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STATE = { pass: 'ok', fail: 'to fix', unknown: 'unknown', info: 'note' }

function toJson (report) {
  return JSON.stringify(report, null, 2)
}

function toHtml (report) {
  const when = new Date(report.time).toLocaleString()
  const color = s => s == null ? '#999' : s >= 80 ? '#2e9e5b' : s >= 50 ? '#d4a017' : '#d64545'

  const checks = report.results.map(r => `
    <section class="check ${esc(r.state)}">
      <h3><span class="dot"></span>${esc(r.title)} <small>${esc(STATE[r.state] || r.state)} · ${esc(r.severity)}</small></h3>
      <p>${esc(r.detail)}</p>
      ${r.items && r.items.length ? `<ul class="things">${r.items.map(i => `<li class="${i.flag ? 'flag' : ''}">${esc(i.text)}${i.note ? ` <em>${esc(i.note)}</em>` : ''}</li>`).join('')}</ul>` : ''}
      ${r.state !== 'pass' && r.fix.length ? `<p class="label">how to fix</p><ol>${r.fix.map(f => `<li>${esc(f)}</li>`).join('')}</ol>` : ''}
      ${r.benchmark ? `<p class="bench">${esc(r.benchmark)}</p>` : ''}
    </section>`).join('')

  const changes = (report.drift && report.drift.changes) || []
  const drift = changes.length
    ? `<h2>what changed</h2><ul class="things">${changes.map(c => `<li>${esc(c.sign)} ${esc(c.title)}: ${esc(c.text)}</li>`).join('')}</ul>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>security checkup · ${esc(report.host)}</title>
<style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", Ubuntu, sans-serif; color: #1a1a1a; background: #fafafa; margin: 0; }
  main { max-width: 680px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 28px 0 8px; }
  .muted, small, em, .bench { color: #777; font-style: normal; font-weight: normal; }
  .score { display: flex; align-items: center; gap: 16px; margin: 24px 0; padding: 20px; background: #fff; border: 1px solid #eaeaea; border-radius: 12px; }
  .num { width: 64px; height: 64px; border-radius: 50%; border: 4px solid ${color(report.score)}; display: grid; place-items: center; font-size: 22px; font-weight: 600; }
  .check { background: #fff; border: 1px solid #eaeaea; border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; break-inside: avoid; }
  .check h3 { font-size: 15px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #aaa; }
  .pass .dot { background: #2e9e5b; } .fail .dot { background: #d64545; }
  .things { padding-left: 18px; } .things .flag { color: #d64545; }
  .label { font-weight: 600; margin-bottom: 0; } ol { margin-top: 4px; }
  @media print { body { background: #fff; } }
</style></head>
<body><main>
  <h1>security checkup</h1>
  <p class="muted">${esc(report.host)} · ${esc(report.os)} · ${esc(when)}</p>
  <div class="score"><div class="num">${report.score ?? '–'}</div>
    <div>${report.results.filter(r => r.state === 'pass').length} ok · ${report.results.filter(r => r.state === 'fail').length} to fix</div></div>
  ${drift}
  <h2>checks</h2>
  ${checks}
  <p class="muted">made by security checkup. it only read settings, nothing was changed.</p>
</main></body></html>`
}

module.exports = { toHtml, toJson }
