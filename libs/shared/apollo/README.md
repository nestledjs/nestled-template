# apollo

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build apollo` to build the library.

## Running unit tests

Run `nx test apollo` to execute the unit tests via [Vitest](https://vitest.dev/).

## Default error policies

`makeClient` sets `defaultOptions.query.errorPolicy: 'all'` and `defaultOptions.mutate.errorPolicy:
'none'`: a query resolves with its GraphQL error beside `data`, and a refused mutation rejects.
From Apollo Client 4.2, every default `errorPolicy` must also be declared to TypeScript, because
the result types of `client.query`, `client.mutate` and the hooks depend on it; an undeclared one
fails to type-check with TS2322 ("A default option for mutate.errorPolicy must be declared in
ApolloClient.DeclareDefaultOptions before usage"). `apollo.ts` declares both:

```ts
declare module '@apollo/client' {
  export namespace ApolloClient {
    export namespace DeclareDefaultOptions {
      interface Query {
        errorPolicy: 'all'
      }
      interface Mutate {
        errorPolicy: 'none'
      }
    }
  }
}
```

Change a default and its declaration together. On Apollo Client 4.1 the declaration is not read yet
and is harmless. See
[declaring default options for type safety](https://www.apollographql.com/docs/react/data/typescript#declaring-default-options-for-type-safety).

To find mutation call sites that still read a refusal from the result (`result.error`), which a
mutation under the `'none'` default never resolves with, run
`node scripts/audit-mutation-error-reads.mjs`.

## The session verdict

Whether a web request is signed in is decided in one place: the web app's session middleware
(`apps/web/app/session/session-middleware.server.ts`), with `judgeSession()` from
`src/lib/session/`. Everything else reads its verdict, `getSession(context)`. Its rule:

- sign out only on an unambiguous `401` (an HTTP 401 or the `UNAUTHENTICATED` code), confirmed by a
  second `Me` call, with no outage evidence;
- outage evidence always outranks a 401: no answer, a 502/503/504, a GraphQL 503, a call that timed
  out, or any server-side client of this instance finding the API unreachable in the last
  `OUTAGE_MEMORY_MS` (30 s);
- message text never decides.

What this library gives the rest of the app:

- `judgeSession(evidence)`: the pure verdict, with a test table over every case.
- `recordApiOutage` / `apiOutageSeenMsAgo`: the process-wide outage memory every server-side
  `makeClient` client records into from its error link.
- `narrowApiError(error)`: what `apolloLoader` turns a thrown error into, so its status and code
  survive React Router's production error sanitization: no answer becomes a 503 `API_UNAVAILABLE`
  route error, a 401 a 401 `API_UNAUTHENTICATED` one. A 401 route error is not a sign-out: the root
  ErrorBoundary asks the server to judge the session again.
- `APOLLO_SESSION_SUSPECT_EVENT`: what the browser error link dispatches for a 401 or
  `UNAUTHENTICATED`. The web app's `SessionRevalidator` answers it with one revalidation (at most one
  per `SESSION_REVALIDATE_COOLDOWN_MS`, never while offline). The error link never navigates.

`pnpm verify:session-decisions` (`scripts/audit-session-decisions.mjs`, run in CI) fails on a
session decision anywhere else: a navigation to `/login`, `/logout` or `/force-logout`, a branch on
a 401 or `UNAUTHENTICATED`, a hand-made 401, a read of the session cookie, or a failed organizations
read answered with `[]`. A deliberate one (a user pressing "Sign in", say) takes
`// nestled-session-allow: <reason>` on its line or the line above.
