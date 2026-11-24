// user choices, saved next to the history
const fs = require('fs')
const path = require('path')

const DEFAULTS = { theme: 'system', remindDays: 7, quick: false, ignored: {} }
const THEMES = ['system', 'light', 'dark']
const REMIND = [0, 7, 14, 30] // 0 = never

const file = base => path.join(base, 'settings.json')

function load (base) {
  try {
    const s = JSON.parse(fs.readFileSync(file(base), 'utf8'))
    return { ...DEFAULTS, ...s, ignored: s.ignored && typeof s.ignored === 'object' ? s.ignored : {} }
  } catch {
    return { ...DEFAULTS, ignored: {} }
  }
}

function save (base, s) {
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(file(base), JSON.stringify(s, null, 2))
  return s
}

// only known keys and values get through from the ui
function update (base, patch) {
  const s = load(base)
  if (THEMES.includes(patch.theme)) s.theme = patch.theme
  if (REMIND.includes(patch.remindDays)) s.remindDays = patch.remindDays
  if (typeof patch.quick === 'boolean') s.quick = patch.quick
  return save(base, s)
}

function ignore (base, id, on, title) {
  const s = load(base)
  if (on) s.ignored[id] = { title: String(title || id).slice(0, 200), time: new Date().toISOString() }
  else delete s.ignored[id]
  return save(base, s)
}

module.exports = { load, update, ignore }
