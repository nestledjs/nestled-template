import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildSchema,
  getVariableValues,
  Kind,
  type DocumentNode,
  type OperationDefinitionNode,
} from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { loader as securityLoader } from '../../../app/routes/settings/security'
import { loader as securityEventsLoader } from '../../../app/routes/settings/security.events'

// The loaders themselves, without the Apollo handler around them.
vi.mock('@nestled-template/shared/apollo', async importOriginal => ({
  ...(await importOriginal<typeof import('@nestled-template/shared/apollo')>()),
  apolloLoader: () => (loader: unknown) => loader,
}))

// The schema the API serves, so a variable it would refuse fails here rather than on the page.
const schema = buildSchema(
  readFileSync(join(import.meta.dirname, '../../../../../api-schema.graphql'), 'utf8'),
)

type Preload = [document: DocumentNode, options?: { variables?: Record<string, unknown> }]

function preloadsOf(loader: unknown): Preload[] {
  const preloadQuery = vi.fn()
  ;(loader as (args: { preloadQuery: unknown }) => unknown)({ preloadQuery })
  return preloadQuery.mock.calls as Preload[]
}

function operationOf(document: DocumentNode): OperationDefinitionNode {
  const operation = document.definitions.find(
    definition => definition.kind === Kind.OPERATION_DEFINITION,
  )
  if (!operation) throw new Error('the preloaded document has no operation')
  return operation
}

describe('the security pages’ preloaded queries', () => {
  it.each([
    ['/settings/security', securityLoader, { input: { take: 3 } }],
    ['/settings/security/events', securityEventsLoader, { input: { take: 50 } }],
  ])('%s sends variables the API accepts', (_path, loader, expected) => {
    const preloads = preloadsOf(loader)
    const errors = preloads.flatMap(([document, options]) => {
      const { variableDefinitions = [] } = operationOf(document)
      const { errors = [] } = getVariableValues(
        schema,
        variableDefinitions,
        options?.variables ?? {},
      )
      return errors.map(error => error.message)
    })
    expect(errors).toEqual([])

    const securityEvents = preloads.find(
      ([document]) => operationOf(document).name?.value === 'MySecurityEvents',
    )
    expect(securityEvents?.[1]?.variables).toEqual(expected)
  })
})
