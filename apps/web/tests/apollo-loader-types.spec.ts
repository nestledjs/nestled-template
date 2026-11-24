// The spec program includes `tests` only, and an ambient declaration has nothing to import.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../app/react-router-route-module.d.ts" />
import { describe, expect, expectTypeOf, it } from 'vitest'
import { apolloLoader } from '@nestled-template/shared/apollo'
import { MySecurityEvents } from '@nestled-template/shared/sdk'

// Checked by `nx typecheck web`, not by running it: when `preloadQuery` is `any`, the assertion on
// it fails and each `@ts-expect-error` below is an unused one.
const loader = apolloLoader()(({ preloadQuery }) => {
  expectTypeOf(preloadQuery).not.toBeAny()

  preloadQuery(MySecurityEvents, { variables: { input: { take: 3 } } })
  // @ts-expect-error the input has no such field
  preloadQuery(MySecurityEvents, { variables: { input: { orderBy: 'createdAt' } } })
  // @ts-expect-error not a value of the enum
  preloadQuery(MySecurityEvents, { variables: { input: { orderDirection: 'desc' } } })
  // @ts-expect-error the query has no such variable
  preloadQuery(MySecurityEvents, { variables: { bogus: 1 } })
  return {}
})

describe('a loader’s preloadQuery', () => {
  it('types the variables from the document', () => {
    expect(loader).toBeTypeOf('function')
  })
})
