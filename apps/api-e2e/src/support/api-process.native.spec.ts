import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { killApiProcessTree, ownedProcessOptions, registerApiProcessCleanup } from './api-process'

// Real processes, no mocks: a launcher and a descendant started the way global setup starts the
// API, stopped the way teardown and cancellation stop it. CI runs this on Linux and native Windows.

const fixture = resolve(__dirname, 'process-tree-fixture.mjs')
const started: number[] = []
const disposers: (() => void)[] = []

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitUntilStopped(pids: number[]) {
  const deadline = Date.now() + 4_000
  while (pids.some(isRunning) && Date.now() < deadline)
    await new Promise(done => setTimeout(done, 50))
  return pids.filter(isRunning)
}

type Launch = 'pnpm-style' | 'direct'

async function startTree(launch: Launch) {
  // Spawned with global setup's own options. 'pnpm-style' is how setup starts `pnpm nx serve api`:
  // on Windows through a shell, so the launcher's PID is cmd.exe's and the fixture runs below it,
  // as pnpm's .cmd shim does; the command is one quoted string there, so paths with spaces survive
  // the shell. 'direct' spawns process.execPath itself with `{ shell: false }`, as a caller that
  // starts node (or the built API) without pnpm does.
  const options = ownedProcessOptions({ shell: launch === 'pnpm-style' })
  const stdio: ['ignore', 'pipe', 'inherit'] = ['ignore', 'pipe', 'inherit']
  const launcher = options.shell
    ? spawn(`"${process.execPath}" "${fixture}"`, { stdio, ...options })
    : spawn(process.execPath, [fixture], { stdio, ...options })
  const [data] = await once(launcher.stdout, 'data')
  const fixturePids = JSON.parse(String(data)) as { launcher: number; descendant: number }
  if (!launcher.pid) throw new Error('the launcher did not start')
  const pids = [...new Set([launcher.pid, fixturePids.launcher, fixturePids.descendant])]
  // Through a shell the tree is three processes deep; without one the launcher is the fixture.
  expect(pids).toHaveLength(options.shell ? 3 : 2)
  started.push(...pids)
  expect(pids.every(isRunning)).toBe(true)
  return { launcher, pids }
}

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const pid of started.splice(0).filter(isRunning)) process.kill(pid, 'SIGKILL')
})

describe.each<Launch>(['pnpm-style', 'direct'])('API process tree cleanup (%s launch)', launch => {
  const expected = process.platform === 'win32' ? 'tree' : 'group'

  it('stops the launcher and its descendant during ordinary teardown', async () => {
    const { launcher, pids } = await startTree(launch)
    expect(killApiProcessTree(launcher)).toBe(expected)
    expect(await waitUntilStopped(pids)).toEqual([])
  })

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('stops both on %s cancellation', async (signal, code) => {
    const { launcher, pids } = await startTree(launch)
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const before = process.listeners(signal)
    disposers.push(registerApiProcessCleanup(launcher))
    // Only our handler: a real signal would also reach the test runner's own handlers.
    process.listeners(signal).find(item => !before.includes(item))?.(signal)
    expect(exit).toHaveBeenCalledWith(code)
    expect(await waitUntilStopped(pids)).toEqual([])
  })

  it('stops both from the exit fallback when teardown never ran', async () => {
    const { launcher, pids } = await startTree(launch)
    const before = process.listeners('exit')
    disposers.push(registerApiProcessCleanup(launcher))
    process.listeners('exit').find(item => !before.includes(item))?.(0)
    expect(await waitUntilStopped(pids)).toEqual([])
  })

  it.runIf(process.platform === 'win32')(
    'reports a taskkill failure and leaves the exit fallback to retry',
    async () => {
      const { launcher, pids } = await startTree(launch)
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const originalExitCode = process.exitCode
      const before = process.listeners('exit')
      disposers.push(registerApiProcessCleanup(launcher))
      vi.stubEnv('SystemRoot', resolve(__dirname, 'no-such-system-root'))
      expect(() => killApiProcessTree(launcher)).toThrow(/ENOENT/)
      expect(pids.every(isRunning)).toBe(true)
      const fallback = process.listeners('exit').find(item => !before.includes(item))
      expect(fallback).toBeDefined()
      fallback?.(0)
      expect(log).toHaveBeenCalledWith('Failed to stop owned API process:', expect.any(Error))
      expect(process.exitCode).toBe(1)
      process.exitCode = originalExitCode
      vi.unstubAllEnvs()
      expect(killApiProcessTree(launcher)).toBe('tree')
      expect(await waitUntilStopped(pids)).toEqual([])
    },
  )
})
