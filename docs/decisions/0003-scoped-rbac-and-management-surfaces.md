# Decision 0003: Scoped RBAC and management surfaces

## Status

Accepted for implementation.

## Context

The template currently has two authorization mechanisms:

- `User.isSuperAdmin` protects platform administration and generated CRUD.
- Organization roles and `subject:action` permissions protect tenant workflows, mostly through
  checks inside service methods.

Inline checks are difficult to audit mechanically. They also encourage each application to invent
its own platform-role model and management experience. At the same time, organization permission
management is product-facing: teams, seats, invitations, ownership, and role vocabulary vary by
application and should remain easy to customize.

## Decision

### Enforcement

Every non-public API operation declares both authentication intent and, when applicable, a scoped
permission policy.

- Platform policy uses stable keys such as `platform.access-control.read`.
- Organization policy continues to use the existing `subject:action` vocabulary.
- A permission declaration is OR by default. A separate all-of form is used when every permission
  is genuinely required.
- Row and object rules remain explicit service checks. A permission answers whether a caller may
  attempt an operation; it does not prove ownership of a particular record.
- GraphQL and REST use the same metadata and enforcement path.

Authentication runs globally for operations declared `@Authenticated()` or `@AdminOnly()` before
permission metadata is evaluated. Method-level auth guards remain temporarily compatible but are no
longer the mechanism permission enforcement depends upon.

`@AdminOnly()` retains its current break-glass meaning: the caller must be a super administrator.
Generated CRUD and the data browser remain behind that boundary. Platform roles do not implicitly
grant generic database CRUD.

### Persistence

Organization roles keep their existing tables and membership relationship. Platform roles use
separate role, permission, and assignment records so a nullable organization identifier never
silently changes the meaning of a role.

Permission definitions are code-owned and seeded. Administrators compose roles from that catalog
and assign roles to users; they do not invent permission keys in the UI.

Platform role mutation enforces:

- a grant ceiling (callers cannot grant capabilities they do not hold),
- immutable system-role identity,
- protection against deleting roles that still have assignments,
- protection against removing the root role through the management API,
- transactional updates and audit records.

Delegated user administration also enforces a principal ceiling: callers cannot act on a user with
equal or higher effective platform access, including through role assignment changes, and nobody
can emulate a root administrator.

`User.isSuperAdmin` remains supported during fleet migration and bypasses platform permission
checks. Removing it requires a separate migration after every downstream has a seeded root role and
verified recovery procedure.

### User interfaces

The reusable package provides a polished platform-admin access-control console. It is transport
agnostic: applications pass an adapter rather than giving the package a generated GraphQL SDK or
generic CRUD client. It supports semantic theme tokens, explicit light/dark/system modes,
accessibility, loading/error/empty states, and responsive layouts.

The template integrates that console under `/admin/access-control` using purpose-built GraphQL
operations.

Organization/client permission management remains application code under `apps/web`. The template
ships a complete example, but downstream applications may change its information architecture,
terminology, and delegation workflow without forking the platform-admin package.

### Packaging

- `@nestledjs/access-control` contains the reusable React platform-admin console and its transport
  contracts.
- NestJS decorators, guards, and request types live in the template API utility library.
- Persistence services and purpose-built GraphQL operations live in the template custom API.
- Neither management surface calls generated CRUD or generated CRUD data-access services.

## Consequences

- Platform-only applications can use platform roles without manufacturing an organization.
- Organization-aware applications can use both scopes without conflating them.
- Static doctor checks can inventory and verify permission declarations.
- Generated CRUD remains a separate super-admin capability.
- The reusable UI is portable, while client-facing organization workflows remain intentionally
  customizable.

## Migration order

1. Add scoped metadata, global authentication, permission evaluation, tests, and platform tables.
2. Seed the platform permission catalog and root-compatible role.
3. Add purpose-built access-control API operations and safety invariants.
4. Add the reusable platform console and template adapter.
5. Complete the organization role-management example.
6. Introduce doctor warnings for inline permission checks, migrate call sites, then promote the
   warnings to failures.
