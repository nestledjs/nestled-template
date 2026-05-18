# ADR-0001: Generated CRUD Is Admin-Only By Default

## Status

Accepted

## Context

The template generates CRUD resolvers for normal application models so super admins have a
consistent management surface. User-facing workflows usually need tighter business logic, ownership
checks, membership checks, and audit behavior than generic CRUD can provide.

## Decision

Generated CRUD operations are protected by `GqlAuthAdminGuard` by default. User-facing operations
must be custom resolver methods with non-colliding names and explicit scope checks derived from
`@CtxUser()` and verified memberships. Prisma `@crudAuth` annotations may relax generated CRUD only
when the schema documents that intent.

## Consequences

Admin tooling stays predictable, while user workflows remain explicit and reviewable. Developers
must create custom operations for user behavior instead of weakening generated CRUD guards to satisfy
frontend needs.

## Alternatives Considered

- Generate user-accessible CRUD by default. Rejected because it makes ownership and tenant isolation
  depend on every caller and model configuration.
- Skip CRUD for normal models. Rejected because it removes the admin management surface and hides
  authorization work rather than specifying it.
