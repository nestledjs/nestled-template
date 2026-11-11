import React from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInfiniteApolloList, type UseInfiniteApolloListOptions } from './useInfiniteApolloList'

// jsdom has no IntersectionObserver. This one records every instance so a test can report the
// sentinel as (not) intersecting, and whether it was disconnected.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly observed: Element[] = []
  disconnected = false

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(node: Element) {
    this.observed.push(node)
  }

  disconnect() {
    this.disconnected = true
  }

  report(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }

  static latest(): FakeIntersectionObserver {
    const live = FakeIntersectionObserver.instances.filter(observer => !observer.disconnected)
    const [latest] = live.slice(-1)
    if (!latest) throw new Error('no live IntersectionObserver')
    return latest
  }
}

type HookResult = ReturnType<typeof useInfiniteApolloList>

function Harness({
  options,
  onResult,
  withLoader = true,
}: {
  readonly options: UseInfiniteApolloListOptions
  readonly onResult: (result: HookResult) => void
  readonly withLoader?: boolean
}) {
  const result = useInfiniteApolloList(options)
  const { loaderRef } = result
  // Reported after every render, once React has committed it.
  React.useEffect(() => onResult(result))
  return withLoader ? <div ref={loaderRef} data-testid="loader" /> : null
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function setup(overrides: Partial<UseInfiniteApolloListOptions> = {}, withLoader = true) {
  let latest: HookResult | undefined
  const options: UseInfiniteApolloListOptions = {
    pageSize: 10,
    fetchMorePage: vi.fn().mockResolvedValue(10),
    getCurrentCount: vi.fn().mockReturnValue(10),
    ...overrides,
  }
  const onResult = (result: HookResult) => {
    latest = result
  }
  const view = render(<Harness options={options} onResult={onResult} withLoader={withLoader} />)
  return {
    options,
    view,
    result: () => {
      if (!latest) throw new Error('hook has not rendered')
      return latest
    },
    rerender: (next: Partial<UseInfiniteApolloListOptions>) => {
      Object.assign(options, next)
      view.rerender(
        <Harness options={{ ...options }} onResult={onResult} withLoader={withLoader} />,
      )
    },
  }
}

describe('useInfiniteApolloList', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the loader element', () => {
    const { view } = setup()

    expect(FakeIntersectionObserver.latest().observed).toEqual([view.getByTestId('loader')])
  })

  it('fetches the next page from the current count when the loader comes into view', async () => {
    const page = deferred<number>()
    const fetchMorePage = vi.fn().mockReturnValue(page.promise)
    const { result } = setup({ fetchMorePage, getCurrentCount: () => 20 })

    act(() => FakeIntersectionObserver.latest().report(true))

    expect(fetchMorePage).toHaveBeenCalledWith(20)
    expect(result().isLoading).toBe(true)

    await act(async () => page.resolve(10))

    expect(result().isLoading).toBe(false)
    expect(result().allLoaded).toBe(false)
  })

  it('ignores the loader leaving view', () => {
    const { options } = setup()

    act(() => FakeIntersectionObserver.latest().report(false))

    expect(options.fetchMorePage).not.toHaveBeenCalled()
  })

  it('fetches one page at a time', () => {
    const fetchMorePage = vi.fn().mockReturnValue(new Promise(() => undefined))
    setup({ fetchMorePage })

    act(() => FakeIntersectionObserver.latest().report(true))
    act(() => FakeIntersectionObserver.latest().report(true))

    expect(fetchMorePage).toHaveBeenCalledTimes(1)
  })

  it('marks the list loaded after a short page and stops fetching', async () => {
    const fetchMorePage = vi.fn().mockResolvedValue(3)
    const { result } = setup({ fetchMorePage })

    await act(async () => FakeIntersectionObserver.latest().report(true))

    expect(result().allLoaded).toBe(true)
    expect(result().isLoading).toBe(false)

    act(() => FakeIntersectionObserver.latest().report(true))
    expect(fetchMorePage).toHaveBeenCalledTimes(1)
  })

  it('does not observe while disabled, and starts when enabled', () => {
    const { rerender } = setup({ disabled: true })

    expect(FakeIntersectionObserver.instances).toHaveLength(0)

    rerender({ disabled: false })
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
  })

  it('does not observe without a loader element', () => {
    setup({}, false)

    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('starts over when a dependency changes', async () => {
    const fetchMorePage = vi.fn().mockResolvedValue(3)
    const { result, rerender } = setup({ fetchMorePage, deps: ['all'] })

    await act(async () => FakeIntersectionObserver.latest().report(true))
    expect(result().allLoaded).toBe(true)

    rerender({ deps: ['active'] })

    expect(result().allLoaded).toBe(false)
    expect(result().isLoading).toBe(false)

    await act(async () => FakeIntersectionObserver.latest().report(true))
    expect(fetchMorePage).toHaveBeenCalledTimes(2)
  })

  it('keeps its state when the dependencies are unchanged', async () => {
    const fetchMorePage = vi.fn().mockResolvedValue(3)
    const filter = { status: 'open' }
    const { result, rerender } = setup({ fetchMorePage, deps: [filter, 1] })

    await act(async () => FakeIntersectionObserver.latest().report(true))
    rerender({ deps: [filter, 1] })

    expect(result().allLoaded).toBe(true)
  })

  it('starts over when the number of dependencies changes', async () => {
    const { result, rerender } = setup({
      fetchMorePage: vi.fn().mockResolvedValue(3),
      deps: ['a'],
    })

    await act(async () => FakeIntersectionObserver.latest().report(true))
    rerender({ deps: ['a', 'b'] })

    expect(result().allLoaded).toBe(false)
  })

  it('reset() clears the loaded and loading flags', () => {
    const { result } = setup()

    act(() => {
      result().setAllLoaded(true)
      result().setIsLoading(true)
    })
    expect(result().allLoaded).toBe(true)
    expect(result().isLoading).toBe(true)

    act(() => result().reset())

    expect(result().allLoaded).toBe(false)
    expect(result().isLoading).toBe(false)
  })

  it('disconnects its observer on unmount', () => {
    const { view } = setup()
    const observer = FakeIntersectionObserver.latest()

    view.unmount()

    expect(observer.disconnected).toBe(true)
  })
})
