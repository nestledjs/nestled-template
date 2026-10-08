import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { killApiProcessTree, registerApiProcessCleanup } from './api-process'
import globalTeardown from './global-teardown'

const originalPlatform = process.platform
const originalExitCode = process.exitCode
const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value })
const disposers: (() => void)[] = []
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  process.exitCode = originalExitCode
  setPlatform(originalPlatform)
})
const child = () => ({ pid: 43210, kill: vi.fn(() => true) }) as unknown as ChildProcess
const signalError = (code: string) => Object.assign(new Error(code), { code })

describe('API process cleanup', () => {
  it.each(['EPERM', 'EINVAL'])(
    'preserves fallback handlers when group signaling fails with %s',
    code => {
      setPlatform('darwin')
      const error = signalError(code)
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw error
      })
      const api = child()
      const before = process.listenerCount('exit')
      disposers.push(registerApiProcessCleanup(api))
      expect(() => killApiProcessTree(api)).toThrow(error)
      expect(api.kill).not.toHaveBeenCalled()
      expect(process.listenerCount('exit')).toBe(before + 1)
    },
  )

  it('propagates a launcher signaling error after an absent process group', () => {
    setPlatform('darwin')
    const error = signalError('EPERM')
    vi.spyOn(process, 'kill').mockImplementation(pid => {
      throw pid < 0 ? signalError('ESRCH') : error
    })
    expect(() => killApiProcessTree(child())).toThrow(error)
  })

  it('kills the entire detached process group on POSIX', () => {
    setPlatform('darwin')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const api = child()
    expect(killApiProcessTree(api)).toBe('group')
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGKILL')
    expect(api.kill).not.toHaveBeenCalled()
  })

  it('reports the single-process fallback accurately', () => {
    setPlatform('darwin')
    const kill = vi.spyOn(process, 'kill').mockImplementation(pid => {
      if (pid < 0) throw signalError('ESRCH')
      return true
    })
    const api = child()
    expect(killApiProcessTree(api)).toBe('process')
    expect(kill).toHaveBeenLastCalledWith(43210, 'SIGKILL')
  })

  it('uses the launcher fallback on Windows', () => {
    setPlatform('win32')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    expect(killApiProcessTree(child())).toBe('process')
    expect(kill).toHaveBeenCalledExactlyOnceWith(43210, 'SIGKILL')
  })

  it('handles absent or already-dead children', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw signalError('ESRCH')
    })
    const api = child()
    expect(killApiProcessTree(api)).toBe('already-stopped')
    expect(killApiProcessTree(null)).toBe('already-stopped')
    expect(killApiProcessTree({} as ChildProcess)).toBe('already-stopped')
  })

  it('does not signal a reaped launcher after its group is gone', () => {
    setPlatform('darwin')
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw signalError('ESRCH')
    })
    expect(killApiProcessTree(Object.assign(child(), { exitCode: 0 }))).toBe('already-stopped')
    expect(kill).toHaveBeenCalledExactlyOnceWith(-43210, 'SIGKILL')
  })

  it('reports failure and retries on exit while preserving cancellation status', () => {
    const error = signalError('EPERM')
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw error
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const before = process.listeners('SIGTERM')
    const beforeExit = process.listeners('exit')
    disposers.push(registerApiProcessCleanup(child()))
    process.listeners('SIGTERM').find(item => !before.includes(item))?.('SIGTERM')
    expect(exit).toHaveBeenCalledWith(143)
    expect(log).toHaveBeenCalledWith('Failed to stop owned API process:', error)
    const fallback = process.listeners('exit').find(item => !beforeExit.includes(item))
    expect(fallback).toBeDefined()
    fallback?.(0)
    expect(log).toHaveBeenCalledTimes(2)
    expect(process.exitCode).toBe(1)
  })

  it('fails teardown without reporting completion when signaling fails', async () => {
    const error = signalError('EPERM')
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw error
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('__WE_STARTED_API__', true)
    vi.stubGlobal('__API_PROCESS__', child())
    await expect(globalTeardown()).rejects.toThrow(error)
    expect(log).not.toHaveBeenCalledWith('✅ E2E test teardown complete')
  })

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('cleans up on %s with the standard cancellation status', (signal, code) => {
    setPlatform('darwin')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const before = process.listeners(signal)
    const dispose = registerApiProcessCleanup(child())
    disposers.push(dispose)
    const listener = process.listeners(signal).find(item => !before.includes(item))
    expect(listener).toBeDefined()
    // Invoke only our handler; emitting a real signal would invoke the test runner's handlers too.
    listener?.(signal)
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGKILL')
    expect(exit).toHaveBeenCalledWith(code)
    expect(process.listeners(signal)).toEqual(before)
  })

  it('unregisters all fallbacks after ordinary teardown and avoids duplicate registrations', () => {
    vi.spyOn(process, 'kill').mockReturnValue(true)
    const before = ['exit', 'SIGINT', 'SIGTERM'].map(event => process.listenerCount(event))
    const api = child()
    disposers.push(registerApiProcessCleanup(api))
    disposers.push(registerApiProcessCleanup(api))
    expect(['exit', 'SIGINT', 'SIGTERM'].map(event => process.listenerCount(event))).toEqual(
      before.map(count => count + 1),
    )
    killApiProcessTree(api)
    expect(['exit', 'SIGINT', 'SIGTERM'].map(event => process.listenerCount(event))).toEqual(before)
  })

  it('cleans up on ordinary process exit without recursively exiting', () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const before = process.listeners('exit')
    disposers.push(registerApiProcessCleanup(child()))
    const listener = process.listeners('exit').find(item => !before.includes(item))
    listener?.(0)
    expect(kill).toHaveBeenCalledOnce()
    expect(exit).not.toHaveBeenCalled()
  })
})
