// `@apollo/client-integration-react-router` types its loader arguments with `CreateServerLoaderArgs`
// from 'react-router/route-module', a path React Router does not export. Unresolved, it is `any`,
// and so is everything derived from it: the `preloadQuery` a loader receives accepted any variables
// for any query. This declares the one type the package imports from there.
//
// Without `pattern`. With `future.v8_middleware`, `LoaderFunctionArgs` has exactly the fields of
// React Router's client loader arguments, so `useLoaderData<typeof loader>()` read the loader as a
// client one and left each query ref wrapped in `unstable_SerializesTo`, readable only through a
// cast. Leaving one field out sends it down the server branch, which unwraps the ref. A loader that
// needs the route pattern can read it in a middleware instead.
//
// An ambient module wins over a real one, so this must go once React Router exports the path or the
// package stops importing it; scripts/apollo-operation-types.spec.mjs fails when either happens.
declare module 'react-router/route-module' {
  export type CreateServerLoaderArgs<_Info> = Omit<
    import('react-router').LoaderFunctionArgs,
    'pattern'
  >
}
