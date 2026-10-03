# ADR-0001: Generated CRUD Is Always Admin-Only

## Status

Accepted

## Context

The template generates CRUD resolvers for normal application models so super admins have a
consistent management surface. User-facing workflows usually need tighter business logic, ownership
checks, membership checks, and audit behavior than generic CRUD can provide.

## Decision

Generated CRUD operations are always protected by `GqlAuthAdminGuard` and `@AdminOnly()`. Prisma
`@crudAuth` annotations may not relax them. User-facing operations must be custom resolver methods
with purpose-built inputs, non-colliding names, explicit Prisma queries, and scope checks derived
from `@CtxUser()` and verified memberships.

The recursive GraphQL-selection-to-Prisma compiler belongs exclusively to generated admin CRUD.
The API app module imports `ApiGeneratedCrudFeatureModule` only to register that sealed surface.
Handwritten resolvers may use `ApiCoreDataAccessService`, but may never import or compose generated
CRUD inputs, resolvers, or runtime services. This includes admin-only workflows, which must define
their own input and explicit Prisma query.

## Consequences

Admin tooling stays predictable, while user workflows remain explicit and reviewable. Developers
must create custom operations for user behavior instead of weakening generated CRUD guards to
satisfy frontend needs. Typed generated filters remain available to the admin data browser, but are
not inherited by application operations.

## Alternatives Considered

- Generate user-accessible CRUD by default. Rejected because it makes ownership and tenant isolation
  depend on every caller and model configuration.
- Skip CRUD for normal models. Rejected because it removes the admin management surface and hides
  authorization work rather than specifying it.
- Authorize recursive relation traversal with model annotations. Rejected because it preserves a
  generic query compiler in lower-privilege code and creates a second authorization language that
  can drift from resolver business rules.
