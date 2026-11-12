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

/** A list-valued scalar or enum column: the generated filter inputs have no field for it. */
const isListColumn = (field: Field) => Boolean(field.isList) && !field.relationName

const isToOneRelation = (field: Field) => Boolean(field.relationName) && !field.isList

/** The scalar foreign key the converter filters a to-one relation's id on, if it has one. */
function foreignKeyOf(model: Model, relation: Field): Field | undefined {
  const fromFields = relation.relationFromFields ?? []
  if (fromFields.length !== 1) return undefined
  return model.fields.find(f => f.name === fromFields[0] && !f.relationName)
}

/** Scalar columns that back a to-one relation; the UI only ever filters them through it. */
function foreignKeyNames(model: Model): Set<string> {
  const names = new Set<string>()
  for (const field of model.fields.filter(isToOneRelation)) {
    const foreignKey = foreignKeyOf(model, field)
    if (foreignKey) names.add(foreignKey.name)
  }
  return names
}

interface FilterCase {
  label: string
  /** What the filter controls (or a URL parameter) hold. */
  state: Record<string, unknown>
  /** What the list query must send: anything else means a filter was dropped or mangled. */
  expected: Record<string, unknown> | undefined
}

/**
 * The UI value a filter control (see components/FilterField.tsx) or a URL parameter produces for
 * one of the model's own columns, and the filter input it must convert to.
 */
function scalarCase(field: Field): Omit<FilterCase, 'label'> | undefined {
  const one = (value: unknown, filter: unknown) => ({
    state: { [field.name]: value },
    expected: { [field.name]: filter },
  })
  if (field.kind === 'enum') {
    const value = firstEnumValue(field.type)
    return value === undefined ? undefined : one(value, { equals: value })
  }
  switch (field.type) {
    case 'Boolean':
      return one(true, { equals: true })
    case 'Int':
    case 'BigInt':
    case 'Float':
    case 'Decimal':
      return one({ gte: 1, lte: 10 }, { gte: 1, lte: 10 })
    case 'DateTime': {
      const range = { gte: '2024-01-01T00:00:00.000Z', lte: '2024-01-31T23:59:59.999Z' }
      return one(range, range)
    }
    case 'String':
      return one('sample', { contains: 'sample' })
    default:
      return undefined
  }
}

/** A to-one relation picked in the panel, or reached through its foreign-key URL parameter. */
function relationCase(model: Model, field: Field): FilterCase {
  const id = sampleId(field.type)
  const foreignKey = foreignKeyOf(model, field)
  return {
    label: field.name,
    state: { [field.name]: { id } },
    expected: foreignKey
      ? { [foreignKey.name]: { equals: id } }
      : { [field.name]: { id: { equals: id } } },
  }
}

/** Related enums (`relation.enumField` in the filter panel), and related list columns. */
function relatedCases(field: Field): FilterCase[] {
  const related = models.find(m => m.name === field.type)
  const cases: FilterCase[] = []
  for (const relatedField of related?.fields ?? []) {
    const label = `${field.name}.${relatedField.name}`
    const enumValue = relatedField.kind === 'enum' ? firstEnumValue(relatedField.type) : undefined
    if (isListColumn(relatedField)) {
      // Not offered by the panel; a value for one (an old URL, app code) must never be sent.
      const value = enumValue ?? 'sample'
      cases.push({
        label,
        state: { [field.name]: { [relatedField.name]: value } },
        expected: undefined,
      })
    } else if (enumValue !== undefined) {
      cases.push({
        label,
        state: { [field.name]: { [relatedField.name]: enumValue } },
        expected: { [field.name]: { [relatedField.name]: { equals: enumValue } } },
      })
    }
  }
  return cases
}

/** Every filter state the list page can hold for a model, one filter at a time. */
function filterCases(model: Model): FilterCase[] {
  const cases: FilterCase[] = []
  const foreignKeys = foreignKeyNames(model)
  for (const field of model.fields) {
    if (field.relationName) {
      if (!field.isList) cases.push(relationCase(model, field), ...relatedCases(field))
      continue
    }
    if (isListColumn(field)) {
      const value = (field.kind === 'enum' && firstEnumValue(field.type)) || 'sample'
      cases.push({ label: field.name, state: { [field.name]: value }, expected: undefined })
      continue
    }
    if (foreignKeys.has(field.name)) continue
    const scalar = scalarCase(field)
    if (scalar) cases.push({ label: field.name, ...scalar })
  }
  return cases
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(source ?? {})) {
    const existing = target[key]
    target[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge({ ...existing }, value) : value
  }
  return target
}

/** Every filter at once, as the panel holds them together. */
function combinedCase(cases: FilterCase[]): FilterCase {
  const state = cases.reduce((acc, c) => deepMerge(acc, c.state), {} as Record<string, unknown>)
  const expected = cases.reduce(
    (acc, c) => deepMerge(acc, c.expected),
    {} as Record<string, unknown>,
  )
  return {
    label: 'all filters',
    state,
    expected: Object.keys(expected).length > 0 ? expected : undefined,
  }
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

function coercionErrors(model: Model, filters: unknown): string[] | undefined {
  const { operation } = listOperation(model)
  const result = getVariableValues(schema, operation.variableDefinitions ?? [], {
    input: { take: 20, skip: 0, filters },
  })
  return result.errors?.map(e => e.message)
}

describe('data browser filters against the API schema', () => {
  it.each(models.map(model => [model.name, model] as const))(
    '%s: every filter control converts to exactly the filter the schema accepts',
    (_name, model) => {
      const { document } = listOperation(model)
      expect(validate(schema, document)).toEqual([])

      const cases = filterCases(model)
      for (const { label, state, expected } of [...cases, combinedCase(cases)]) {
        const filters = toFilterInput(model, state, models)
        // The exact output, so a filter the converter drops or mangles fails here too.
        expect({ label, filters, errors: coercionErrors(model, filters) }).toEqual({
          label,
          filters: expected,
          errors: undefined,
        })
      }
    },
  )

  // Bare UI values must be rejected, or the spec above would pass without the conversion.
  const controls: Array<[string, (field: Field) => boolean, (field: Field) => unknown]> = [
    ['a to-one relation', isToOneRelation, field => ({ id: sampleId(field.type) })],
    ['a boolean', field => field.type === 'Boolean' && !field.isList, () => true],
    [
      'an enum',
      field => field.kind === 'enum' && !field.isList && firstEnumValue(field.type) !== undefined,
      field => firstEnumValue(field.type),
    ],
  ]

  it.each(controls)(
    'rejects the bare UI value of %s, and accepts it converted',
    (_kind, matches, bareValue) => {
      // Any model with such a field will do; take the first rather than naming one.
      const model = models.find(m => m.fields.some(matches))
      const field = model?.fields.find(matches)
      expect(model && field).toBeTruthy()
      if (!model || !field) return

      const state = { [field.name]: bareValue(field) }
      expect(coercionErrors(model, state)?.length).toBeGreaterThan(0)

      const filters = toFilterInput(model, state, models)
      expect(filters).toBeDefined()
      expect(filters).not.toEqual(state)
      expect(coercionErrors(model, filters)).toBeUndefined()
    },
  )
})
