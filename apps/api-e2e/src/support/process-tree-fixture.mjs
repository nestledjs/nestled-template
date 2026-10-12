// @ts-check
// A stand-in for `pnpm nx serve api`: a launcher that starts one descendant and keeps running. The
// launcher prints `{"launcher": <pid>, "descendant": <pid>}` once both are up.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const keepAlive = () => setInterval(() => undefined, 60_000)

if (process.argv[2] === 'descendant') {
  keepAlive()
  process.stdout.write(`${process.pid}\n`)
} else {
  const descendant = spawn(process.execPath, [fileURLToPath(import.meta.url), 'descendant'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  keepAlive()
  descendant.stdout.once('data', data => {
    const output = JSON.stringify({
      launcher: process.pid,
      descendant: Number(String(data).trim()),
    })
    process.stdout.write(`${output}\n`)
  })
}
