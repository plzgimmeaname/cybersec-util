const { execFile } = require('child_process')

// run a command, never throw, always give back text
module.exports = function sh (cmd, args = [], { timeout = 15000 } = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? err.code : 0,
        out: String(stdout || '').trim(),
        err: err && err.killed ? 'took too long to answer, try again later' : String(stderr || '').trim() || (err ? err.message : '')
      })
    })
  })
}
