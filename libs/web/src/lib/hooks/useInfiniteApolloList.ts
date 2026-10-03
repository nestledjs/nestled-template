import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseInfiniteApolloListOptions {
  pageSize: number
  /** Called to fetch the next page. Returns number of new items fetched. */
  fetchMorePage: (skip: number) => Promise<number>
  /** Current total count of items already loaded */
  getCurrentCount: () => number
  /** Disable loading (e.g., while filters are changing) */
  disabled?: boolean
  /** Effect dependencies that should reset pagination */
  deps?: ReadonlyArray<unknown>
}

export function useInfiniteApolloList(options: UseInfiniteApolloListOptions) {
  const { pageSize, fetchMorePage, getCurrentCount, disabled = false, deps = [] } = options

  const loaderRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [allLoaded, setAllLoaded] = useState(false)

  const reset = useCallback(() => {
    setAllLoaded(false)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (disabled) return
    const node = loaderRef.current
    if (!node) return

    const observer = new IntersectionObserver(entries => {
      const first = entries[0]
      if (!first?.isIntersecting) return
      if (isLoading || allLoaded) return

      setIsLoading(true)
      const skip = getCurrentCount()
      fetchMorePage(skip)
        .then(newCount => {
          if (newCount < pageSize) setAllLoaded(true)
        })
        .finally(() => setIsLoading(false))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [allLoaded, disabled, fetchMorePage, getCurrentCount, isLoading, pageSize])

  return { loaderRef, isLoading, allLoaded, reset, setAllLoaded, setIsLoading }
}
