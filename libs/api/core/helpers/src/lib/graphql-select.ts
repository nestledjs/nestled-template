import graphqlFields from 'graphql-fields'
import { GraphQLResolveInfo } from 'graphql/type'
import { DATABASE_MODELS, DatabaseModel, DatabaseField } from '@nestled-template/shared/sdk'

function getNamedType(type: any): string {
  if (type.ofType) return getNamedType(type.ofType)
  return type.name
}

function getModelFromTypeName(typeName: string): DatabaseModel | undefined {
  return DATABASE_MODELS.find(m => m.name === typeName)
}

function buildSelectTree(fieldTree: any, model: DatabaseModel): any {
  const result: Record<string, any> = {}

  for (const key in fieldTree) {
    const field = model.fields.find((f: DatabaseField) => f.name === key)
    if (!field) continue

    if (field.relationName && typeof fieldTree[key] === 'object') {
      const relatedModel = DATABASE_MODELS.find(m => m.name === field.type)
      if (relatedModel) {
        result[key] = {
          select: buildSelectTree(fieldTree[key], relatedModel),
        }
      }
    } else {
      result[key] = true
    }
  }

  return result
}

/**
 * Automatically converts a GraphQL `info` object into a Prisma `select` object.
 * Uses the generated DATABASE_MODELS for schema introspection (Prisma v7 compatible).
 */
export function createSelect(info: GraphQLResolveInfo) {
  const returnTypeName = getNamedType(info.returnType)
  const model = getModelFromTypeName(returnTypeName)

  if (!model) {
    throw new Error(
      `Model "${returnTypeName}" not found in DATABASE_MODELS. Make sure to run the SDK generator.`,
    )
  }

  const rawFields = graphqlFields(info)
  return buildSelectTree(rawFields, model)
}
