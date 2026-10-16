const { execFile } = require('child_process')

// run a command, never throw, always give back text
module.exports = function sh (cmd, args = []) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        out: String(stdout || '').trim(),
        err: String(stderr || '').trim() || (err ? err.message : '')
      })
    })
  })
}
