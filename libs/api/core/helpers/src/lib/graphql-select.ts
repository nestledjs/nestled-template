import { ForbiddenException } from '@nestjs/common'
import graphqlFields from 'graphql-fields'
import { GraphQLResolveInfo } from 'graphql/type'
import { DATABASE_MODELS, DatabaseModel, DatabaseField } from '@nestled-template/shared/sdk'
import { getViewer, Viewer } from './viewer-context'

function getNamedType(type: any): string {
  if (type.ofType) return getNamedType(type.ofType)
  return type.name
}

function getModelFromTypeName(typeName: string): DatabaseModel | undefined {
  return DATABASE_MODELS.find(m => m.name === typeName)
}

// Ranks are compared, never named, so an unrecognised level lands between `user` and `admin` rather
// than being treated as permissive.
const PUBLIC_RANK = 0
const USER_RANK = 1
const CUSTOM_GUARD_RANK = 2
const ADMIN_RANK = 3

// A model with no `@crudAuth` annotation defaults to admin, matching the generated resolvers.
const levelRank = (level: string | undefined): number => {
  if (!level) return ADMIN_RANK
  const normalized = level.toLowerCase()
  if (normalized === 'public') return PUBLIC_RANK
  if (normalized === 'user') return USER_RANK
  if (normalized === 'admin') return ADMIN_RANK
  // A custom guard cannot be evaluated here — only the guard itself knows. Rank it above `user` so
  // a plain authenticated caller cannot traverse into it.
  return CUSTOM_GUARD_RANK
}

// No viewer means nothing established one for this request, which is indistinguishable from a
// misconfiguration. Rank it as anonymous rather than trusting it.
const viewerRank = (viewer: Viewer | undefined): number => {
  if (!viewer) return PUBLIC_RANK
  if (viewer.isSuperAdmin) return ADMIN_RANK
  if (viewer.isAuthenticated) return USER_RANK
  return PUBLIC_RANK
}

const requiredRankFor = (relatedModel: DatabaseModel, isList: boolean | undefined): number =>
  levelRank(isList ? relatedModel.auth?.readMany : relatedModel.auth?.readOne)

// A guard protects an entry point. Nested selections are not entry points: the whole selection set
// compiles into one Prisma query, so no second guard ever runs for a relation. Authorization for
// traversal has to happen here, against the level the related model declares for itself.
function assertCanTraverse(
  parentModel: DatabaseModel,
  fieldName: string,
  relatedModel: DatabaseModel,
  isList: boolean | undefined,
  viewer: Viewer | undefined,
): void {
  if (viewerRank(viewer) >= requiredRankFor(relatedModel, isList)) return

  throw new ForbiddenException(
    `Not allowed to read ${parentModel.name}.${fieldName}: ${relatedModel.name} requires a higher access level than the current request has.`,
  )
}

function buildSelectTree(fieldTree: any, model: DatabaseModel, viewer: Viewer | undefined): any {
  const result: Record<string, any> = {}

  for (const key in fieldTree) {
    const field = model.fields.find((f: DatabaseField) => f.name === key)
    if (!field) continue

    if (field.relationName && typeof fieldTree[key] === 'object') {
      const relatedModel = DATABASE_MODELS.find(m => m.name === field.type)
      if (relatedModel) {
        assertCanTraverse(model, key, relatedModel, field.isList, viewer)
        result[key] = {
          select: buildSelectTree(fieldTree[key], relatedModel, viewer),
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
 *
 * Relations are only traversed when the current request is allowed to read the related model. Pass
 * `viewer` explicitly from a caller that runs outside a request; otherwise it is taken from the
 * request-scoped context and an absent one is treated as anonymous.
 */
export function createSelect(info: GraphQLResolveInfo, viewer: Viewer | undefined = getViewer()) {
  const returnTypeName = getNamedType(info.returnType)
  const model = getModelFromTypeName(returnTypeName)

  if (!model) {
    throw new Error(
      `Model "${returnTypeName}" not found in DATABASE_MODELS. Make sure to run the SDK generator.`,
    )
  }

  const rawFields = graphqlFields(info)
  return buildSelectTree(rawFields, model, viewer)
}
