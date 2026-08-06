import { AsyncLocalStorage } from 'node:async_hooks'
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { Observable } from 'rxjs'

/**
 * Who is making the current request, reduced to what relation-traversal authorization needs.
 *
 * `createSelect` compiles a whole GraphQL selection set into one nested Prisma query, so nested
 * relations are fetched as extra columns on the root query rather than through a second resolver.
 * That means no second guard runs, and the select builder has to make the authorization decision
 * itself. It only receives `GraphQLResolveInfo`, which carries no request context, and the generated
 * data-access service is a plain singleton — so the viewer reaches it out of band.
 */
export interface Viewer {
  isAuthenticated: boolean
  isSuperAdmin: boolean
}

const storage = new AsyncLocalStorage<Viewer>()

export const runWithViewer = <T>(viewer: Viewer, callback: () => T): T =>
  storage.run(viewer, callback)

/** Returns undefined when nothing established a viewer. Callers must treat that as untrusted. */
export const getViewer = (): Viewer | undefined => storage.getStore()

const toViewer = (user: { isSuperAdmin?: boolean } | undefined): Viewer => ({
  isAuthenticated: Boolean(user),
  isSuperAdmin: Boolean(user?.isSuperAdmin),
})

/**
 * Publishes the authenticated user for the duration of the request.
 *
 * Registered globally so it covers generated and hand-written resolvers alike, without changing any
 * generated method signature. Interceptors run after guards, so `req.user` is already populated by
 * the time this executes — an unauthenticated request simply yields an unauthenticated viewer
 * rather than none, which is the distinction the select builder needs.
 */
@Injectable()
export class ViewerContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request =
      GqlExecutionContext.create(context).getContext()?.req ??
      context.switchToHttp?.().getRequest?.()

    return runWithViewer(toViewer(request?.user), () => next.handle())
  }
}
