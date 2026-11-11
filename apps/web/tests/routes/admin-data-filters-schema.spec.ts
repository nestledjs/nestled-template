import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildSchema,
  getVariableValues,
  Kind,
  validate,
  type DocumentNode,
  type OperationDefinitionNode,
} from 'graphql'
import * as Sdk from '@nestled-template/shared/sdk'
import { DATABASE_MODELS } from '@nestled-template/shared/sdk'
import { getAdminDocuments, toFilterInput } from '@nestledjs/data-browser'

// The data browser's filter controls keep bare UI values (`{ isActive: true }`,
// `{ user: { id } }`); the generated list queries take a typed `<Model>FilterInput`. This sends
// what every filter control (and a foreign-key URL parameter) produces for every model through
// GraphQL's own variable coercion against the committed schema, so a mismatch between the
// converter and the generated filter inputs fails here rather than as a list that never loads.

const schema = buildSchema(
  readFileSync(path.resolve(import.meta.dirname, '../../../../api-schema.graphql'), 'utf8'),
)

type Field = (typeof DATABASE_MODELS)[number]['fields'][number]
type Model = (typeof DATABASE_MODELS)[number]

const models = DATABASE_MODELS as readonly Model[]

function sampleId(modelName: string): string | number {
  const idField = models.find(m => m.name === modelName)?.fields.find(f => f.isId)
  return idField?.type === 'Int' ? 1 : '00000000-0000-4000-8000-000000000001'
}

function firstEnumValue(enumType: string): string | undefined {
  const values = (Sdk as Record<string, unknown>)[enumType]
  return values && typeof values === 'object'
    ? Object.values(values).find((v): v is string => typeof v === 'string')
    : undefined
}

/** The UI value each filter control produces for a field (see components/FilterField.tsx). */
function uiValue(field: Field): unknown {
  if (field.relationName) return { id: sampleId(field.type) }
  if (field.kind === 'enum') return firstEnumValue(field.type)
  switch (field.type) {
    case 'Boolean':
      return true
    case 'Int':
    case 'BigInt':
    case 'Float':
    case 'Decimal':
      return { gte: 1, lte: 10 }
    case 'DateTime':
      return { gte: '2024-01-01T00:00:00.000Z', lte: '2024-01-31T23:59:59.999Z' }
    case 'String':
      return 'sample'
    default:
      return undefined
  }
}

/** Every filter state the list page can hold for a model, one field at a time. */
function filterStates(model: Model): Array<[string, Record<string, unknown>]> {
  const states: Array<[string, Record<string, unknown>]> = []
  for (const field of model.fields) {
    if (field.isList) continue
    const value = uiValue(field)
    if (value !== undefined) states.push([field.name, { [field.name]: value }])

    // Related enums: `relation.enumField` in the filter panel.
    if (field.relationName) {
      const related = models.find(m => m.name === field.type)
      for (const relatedField of related?.fields ?? []) {
        const enumValue = relatedField.kind === 'enum' && firstEnumValue(relatedField.type)
        if (enumValue) {
          states.push([
            `${field.name}.${relatedField.name}`,
            { [field.name]: { [relatedField.name]: enumValue } },
          ])
        }
      }
    }
  }
  return states
}

function listOperation(model: Model): {
  document: DocumentNode
  operation: OperationDefinitionNode
} {
  const document = getAdminDocuments(Sdk, model).listQuery as DocumentNode
  const operation = document.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
  )
  if (!operation) throw new Error(`No list operation for ${model.name}`)
  return { document, operation }
}

describe('data browser filters against the API schema', () => {
  it.each(models.map(model => [model.name, model] as const))(
    '%s: every filter control produces variables the schema accepts',
    (_name, model) => {
      const { document, operation } = listOperation(model)
      expect(validate(schema, document)).toEqual([])

      const states = filterStates(model)
      const combined = Object.assign({}, ...states.map(([, state]) => state))
      for (const [label, state] of [...states, ['all filters', combined] as const]) {
        const filters = toFilterInput(model, state, models)
        const result = getVariableValues(schema, operation.variableDefinitions ?? [], {
          input: { take: 20, skip: 0, filters },
        })
        expect({ label, errors: result.errors?.map(e => e.message) }).toEqual({
          label,
          errors: undefined,
        })
      }
    },
  )

  it('rejects the bare UI state, so the conversion is what makes it valid', () => {
    const model = models.find(m => m.name === 'OrganizationMember') as Model
    const { operation } = listOperation(model)
    const result = getVariableValues(schema, operation.variableDefinitions ?? [], {
      input: { filters: { user: { id: sampleId('User') } } },
    })
    expect(result.errors?.length).toBeGreaterThan(0)
  })
})
