// shared bits for the listening ports check

function isLoopback (addr) {
  return /^(127\.|::1$|\[::1\]|localhost)/.test(addr)
}

// sockets = [{ addr, port, name }], system = names the os itself runs
function summarize (sockets, system) {
  const exposed = sockets.filter(s => !isLoopback(s.addr))
  const byApp = new Map()
  let sys = 0
  for (const s of exposed) {
    const name = (s.name || 'unknown app').toLowerCase()
    if (system.some(n => n.toLowerCase() === name)) { sys++; continue }
    if (!byApp.has(name)) byApp.set(name, new Set())
    byApp.get(name).add(s.port)
  }

  const sysNote = sys ? ` (${sys} from the system itself, these are normal)` : ''
  if (!byApp.size) return { status: 'closed', detail: `no apps are open to your network${sysNote}` }

  const ports = p => [...p].sort((a, b) => a - b).join(', ')
  const list = [...byApp].map(([name, p]) => `${name} (${ports(p)})`)
  const items = [...byApp].map(([name, p]) => ({ text: name, note: `port ${ports(p)}`, flag: true }))
  return { status: 'open', detail: `open to your network: ${list.join(', ')}${sysNote}`, items }
}

module.exports = { summarize }
