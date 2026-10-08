import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { killApiProcessTree, registerApiProcessCleanup } from './api-process'

const originalPlatform = process.platform
const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value })
const disposers: (() => void)[] = []
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  vi.restoreAllMocks()
  setPlatform(originalPlatform)
})
const child = () => ({ pid: 43210, kill: vi.fn(() => true) }) as unknown as ChildProcess

describe('API process cleanup', () => {
  it('kills the entire detached process group on POSIX', () => {
    setPlatform('darwin')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const api = child()
    expect(killApiProcessTree(api)).toBe('group')
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGKILL')
    expect(api.kill).not.toHaveBeenCalled()
  })

  it('reports the single-process fallback accurately', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('No such group')
    })
    const api = child()
    expect(killApiProcessTree(api)).toBe('process')
    expect(api.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('uses the launcher fallback on Windows', () => {
    setPlatform('win32')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    expect(killApiProcessTree(child())).toBe('process')
    expect(kill).not.toHaveBeenCalled()
  })

  it('handles absent or already-dead children', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('No such group')
    })
    const api = child()
    vi.mocked(api.kill).mockReturnValue(false)
    expect(killApiProcessTree(api)).toBe('already-stopped')
    vi.mocked(api.kill).mockImplementation(() => {
      throw new Error('Already dead')
    })
    expect(killApiProcessTree(api)).toBe('already-stopped')
    expect(killApiProcessTree(null)).toBe('already-stopped')
    expect(killApiProcessTree({} as ChildProcess)).toBe('already-stopped')
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
