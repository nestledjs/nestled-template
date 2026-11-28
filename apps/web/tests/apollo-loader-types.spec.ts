// The spec program includes `tests` only, and an ambient declaration has nothing to import.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../app/react-router-route-module.d.ts" />
import { describe, expect, expectTypeOf, it } from 'vitest'
import { parse } from 'graphql'
import type { TypedDocumentNode } from '@apollo/client'
import type { QueryRef } from '@apollo/client/react'
import type { useLoaderData } from 'react-router'
import { apolloLoader } from '@nestled-template/shared/apollo'

// A document defined here rather than one from the generated SDK, so this spec passes unchanged in
// a project whose API has none of the template's operations. The types are what codegen would write
// for it: an input with optional fields and an enum.
type ThingsQuery = { things: Array<{ id: string }> }
type ThingsQueryVariables = { input: { take?: number; orderDirection?: 'ASC' | 'DESC' } }
const Things: TypedDocumentNode<ThingsQuery, ThingsQueryVariables> = parse(
  'query Things($input: ThingsInput!) { things(input: $input) { id } }',
)

// Checked by `nx typecheck web`, not by running it: when `preloadQuery` is `any`, the assertion on
// it fails and each `@ts-expect-error` below is an unused one.
const loader = apolloLoader()(({ preloadQuery }) => {
  expectTypeOf(preloadQuery).not.toBeAny()

  preloadQuery(Things, { variables: { input: { take: 3 } } })
  // @ts-expect-error the input has no such field
  preloadQuery(Things, { variables: { input: { orderBy: 'createdAt' } } })
  // @ts-expect-error not a value of the enum
  preloadQuery(Things, { variables: { input: { orderDirection: 'desc' } } })
  // @ts-expect-error the query has no such variable
  preloadQuery(Things, { variables: { bogus: 1 } })
  return { thingsQueryRef: preloadQuery(Things, { variables: { input: {} } }) }
})

// With `future.v8_middleware`, `LoaderFunctionArgs` has the same fields as the client loader
// arguments, so `useLoaderData<typeof loader>()` took the client branch and left the query ref
// wrapped in `unstable_SerializesTo`, which nothing can read without a cast. The server branch
// unwraps it.
type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>
expectTypeOf<LoaderData>().toEqualTypeOf<{
  thingsQueryRef: QueryRef<ThingsQuery, ThingsQueryVariables>
}>()

describe('a loader’s preloadQuery', () => {
  it('types the variables from the document', () => {
    expect(loader).toBeTypeOf('function')
  })
})
