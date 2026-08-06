import { CallHandler, ExecutionContext } from '@nestjs/common'
import { defer, of } from 'rxjs'
import { getViewer, runWithViewer, ViewerContextInterceptor } from './viewer-context'

// GqlExecutionContext reads the resolver argument tuple, where index 2 is the GraphQL context.
const gqlContextFor = (user: unknown): ExecutionContext => {
  const args = [undefined, undefined, { req: { user } }, undefined]
  return {
    getType: () => 'graphql',
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext
}

// Captures whatever the viewer looks like at the moment the handler actually runs, which is the
// only moment that matters — the select builder reads it from inside the resolver.
const capturingHandler = (sink: { seen?: ReturnType<typeof getViewer> }): CallHandler => ({
  handle: () => {
    sink.seen = getViewer()
    return of(null)
  },
})

// The handler above reads the viewer while `handle()` is still on the stack, which an interceptor
// that only wraps the `handle()` call would satisfy without the store surviving any further. A real
// resolver is reached through a cold observable instead: nothing runs until something subscribes,
// and that happens after `handle()` has returned. This is the shape that distinguishes a store
// scoped to the subscription from one scoped to the call.
const coldCapturingHandler = (sink: { seen?: ReturnType<typeof getViewer> }): CallHandler => ({
  handle: () =>
    defer(() => {
      sink.seen = getViewer()
      return of(null)
    }),
})

describe('runWithViewer', () => {
  it('exposes the viewer for the duration of the callback and not after', () => {
    expect(getViewer()).toBeUndefined()

    runWithViewer({ isAuthenticated: true, isSuperAdmin: true }, () => {
      expect(getViewer()).toEqual({ isAuthenticated: true, isSuperAdmin: true })
    })

    expect(getViewer()).toBeUndefined()
  })

  it('keeps nested scopes independent', () => {
    runWithViewer({ isAuthenticated: true, isSuperAdmin: false }, () => {
      runWithViewer({ isAuthenticated: true, isSuperAdmin: true }, () => {
        expect(getViewer()?.isSuperAdmin).toBe(true)
      })
      expect(getViewer()?.isSuperAdmin).toBe(false)
    })
  })
})

describe('ViewerContextInterceptor', () => {
  it('publishes an authenticated non-admin viewer', () => {
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1', isSuperAdmin: false }), capturingHandler(sink))
      .subscribe()

    expect(sink.seen).toEqual({ isAuthenticated: true, isSuperAdmin: false })
  })

  it('publishes a super admin viewer', () => {
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1', isSuperAdmin: true }), capturingHandler(sink))
      .subscribe()

    expect(sink.seen).toEqual({ isAuthenticated: true, isSuperAdmin: true })
  })

  it('publishes an anonymous viewer when the request carries no user', () => {
    // An unauthenticated request must still produce a viewer. Producing none would be
    // indistinguishable from the interceptor not running at all.
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor(undefined), capturingHandler(sink))
      .subscribe()

    expect(sink.seen).toEqual({ isAuthenticated: false, isSuperAdmin: false })
  })

  it('never reports super admin for a user that does not claim it', () => {
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1' }), capturingHandler(sink))
      .subscribe()

    expect(sink.seen?.isSuperAdmin).toBe(false)
  })

  it('makes the viewer visible to the handler, not merely to the interceptor', () => {
    // The load-bearing behaviour: the store must still be active when the handler executes,
    // otherwise every relation traversal would fall back to deny-by-default.
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1', isSuperAdmin: true }), capturingHandler(sink))
      .subscribe()

    expect(sink.seen).toBeDefined()
  })

  it('keeps the viewer visible to a cold handler that only runs on subscribe', () => {
    // Regression guard for the store being scoped to the `handle()` call instead of the
    // subscription. With `runWithViewer(viewer, () => next.handle())` this sees undefined, and
    // every relation traversal in the request would deny by default.
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1', isSuperAdmin: true }), coldCapturingHandler(sink))
      .subscribe()

    expect(sink.seen).toEqual({ isAuthenticated: true, isSuperAdmin: true })
  })

  it('does not leak the viewer past the subscription', () => {
    const sink: { seen?: ReturnType<typeof getViewer> } = {}
    new ViewerContextInterceptor()
      .intercept(gqlContextFor({ id: 'u1', isSuperAdmin: true }), coldCapturingHandler(sink))
      .subscribe()

    expect(getViewer()).toBeUndefined()
  })
})
