import { render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// tests/setup.ts unmounts rendered trees before a spec's own vi.unstubAllGlobals() runs. Without
// it, the spec's afterEach unstubs first, nothing has unmounted yet when it checks, and the later
// unmount meets the real (absent) global.

declare global {
  // eslint-disable-next-line no-var
  var teardownProbe: { name: string } | undefined
}

const seenOnUnmount: Array<string | undefined> = []

function UsesStubbedGlobal() {
  useEffect(() => () => void seenOnUnmount.push(globalThis.teardownProbe?.name), [])
  return <p>mounted</p>
}

describe('teardown order for a spec that unstubs globals in afterEach', () => {
  beforeEach(() => {
    seenOnUnmount.length = 0
    vi.stubGlobal('teardownProbe', { name: 'stub' })
  })

  // The usual spec teardown, then the check: by the time vi.unstubAllGlobals() returns, the tree
  // has unmounted and its effect cleanup saw the stub. Each test checks its own unmount, so either
  // can run alone (`-t`) or in any order.
  afterEach(() => {
    vi.unstubAllGlobals()
    expect(seenOnUnmount).toEqual(['stub'])
    expect(globalThis.teardownProbe).toBeUndefined()
  })

  it('renders a component that reads a stubbed global when it unmounts', () => {
    render(<UsesStubbedGlobal />)
    expect(globalThis.teardownProbe).toEqual({ name: 'stub' })
  })

  it('renders it again', () => {
    render(<UsesStubbedGlobal />)
    expect(globalThis.teardownProbe).toEqual({ name: 'stub' })
  })
})
