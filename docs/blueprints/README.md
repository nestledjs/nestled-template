# Nestled Blueprints

Blueprints are canonical implementation recipes for humans and AI agents. They
should describe the intended behavior, touched files, generation commands,
security checks, and verification path for common framework changes.

The goal is not to replace generators immediately. The first version should make
the correct implementation path obvious and repeatable. Generators can later
automate stable blueprints.

## Proposed Blueprints

### Extend a Default Model

Scope: model-adjacent custom resolver/service methods without touching generated
CRUD or colliding with generated admin operation names.

See [Extend a Default Model](extend-default-model.md).

### Add a Tenant-Scoped Model

Scope: Prisma model, generated admin CRUD, user-facing resolver, SDK operations,
web route, tests.

Key checks:

- model has an `organizationId` relation when data belongs to an organization
- generated admin CRUD remains admin-only
- user resolver validates organization membership or permissions
- route is registered in `apps/web/app/routes.tsx`
- `pnpm db-update` is run after schema changes

### Add an API Plugin

Scope: cross-model API feature modules with resolvers, services, controllers,
DTOs, and product workflow rules.

See [Add an API Plugin](add-plugin.md).

### Add an API Integration

Scope: NestJS-injectable wrappers around external providers and SDKs.

See [Add an API Integration](add-integration.md).

### Add an Admin-Managed Model

Scope: Prisma model, generated CRUD, admin navigation, data browser visibility,
seed data when useful.

Key checks:

- no `@skipCrud` unless the model is security-sensitive internal data
- model appears in generated SDK/admin operations
- admin UI copy explains the operational meaning of the model

### Add a Billing-Gated Feature

Scope: plan limits, usage service, subscription guard, UI disabled states,
billing settings.

Key checks:

- server enforces the limit
- UI explains upgrade path
- usage is auditable and testable
- Stripe-specific calls stay in integrations

### Add a File Upload Field

Scope: Prisma relation to `StoredFile`, storage plugin usage, GraphQL operation,
web upload control, cleanup behavior.

Key checks:

- provider-specific code stays in storage integrations
- local storage remains development-friendly
- permissions check ownership before download, update, or delete

### Add an MCP Tool

Scope: MCP tool registration, auth context, tool schema, audit log, tests.

Key checks:

- tool declares whether it is personal, organization-scoped, or admin-scoped
- tool validates explicit scope/permission before reading or mutating data
- output avoids secrets and credential material
- tool call is auditable

### Add a Settings Page

Scope: route file, route registration, SDK operation, form state, validation,
empty/error states.

Key checks:

- route is registered manually
- API mutation enforces the same rules as the UI
- user-facing errors are actionable

## Blueprint Format

Each blueprint should eventually use this structure:

```markdown
# Blueprint Name

## Intent

## When To Use

## Files Touched

## Steps

## Security Checks

## Generation Commands

## Verification

## Common Mistakes
```
