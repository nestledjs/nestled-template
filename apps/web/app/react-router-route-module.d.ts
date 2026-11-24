// `@apollo/client-integration-react-router` types its loader arguments with `CreateServerLoaderArgs`
// from 'react-router/route-module', a path React Router does not export. Unresolved, it is `any`,
// and so is everything derived from it: the `preloadQuery` a loader receives accepted any variables
// for any query. This declares the one type the package imports from there.
//
// An ambient module wins over a real one, so this must go once React Router exports the path or the
// package stops importing it; scripts/apollo-operation-types.spec.mjs fails when either happens.
declare module 'react-router/route-module' {
  export type CreateServerLoaderArgs<_Info> = import('react-router').LoaderFunctionArgs
}
