import { SetMetadata } from '@nestjs/common'

export const INHERITED_PARENT_AUTHORIZATION_KEY = 'nestled:inheritedParentAuthorization'

/**
 * Declares that a GraphQL field returns only a value already present on its authorized parent.
 *
 * Use this only for pure projections: the resolver must not query by a parent-derived identifier,
 * call another service, or otherwise expand what the parent operation authorized.
 */
export const InheritedParentAuthorization = () =>
  SetMetadata(INHERITED_PARENT_AUTHORIZATION_KEY, true)
