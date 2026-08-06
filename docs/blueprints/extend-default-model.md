# Extend a Default Model

Use this blueprint when adding custom behavior centered on one Prisma model while
preserving generated admin CRUD.

## Intent

Add model-specific custom operations without editing generated CRUD, overriding
generated methods, or colliding with generated SDK operation names.

`ApiGeneratedCrudFeatureModule` registers generated admin CRUD independently.
Custom model resolvers are additive and must not extend generated resolvers.

## When To Use

Use this for:

- user-facing operations for one model
- model-specific membership or permission checks
- model-specific DTOs
- custom relation fields or computed fields
- workflows whose natural owner is one model

Do not use this for cross-model product capabilities. Use a plugin instead.

## Files Touched

Typical paths:

```text
libs/api/custom/src/lib/default/<model>/<model>.resolver.ts
libs/api/custom/src/lib/default/<model>/<model>.service.ts
libs/api/custom/src/lib/default/<model>/<model>.module.ts
libs/api/custom/src/lib/default/<model>/dto/*
libs/shared/sdk/src/graphql/<feature>/*.graphql
apps/web/app/routes.tsx
```

## Naming Rules

Generated GraphQL field names are reserved:

```text
<model>
<models>
<models>Count
create<Model>
update<Model>
delete<Model>
```

Generated SDK admin operation names are also reserved:

```text
__Admin<Model>
__Admin<Models>
__Admin<Model>Pagination
__AdminCreate<Model>
__AdminUpdate<Model>
__AdminDelete<Model>
```

Custom operations should use clear non-generated names:

```text
myOrganizations
userCreateOrganization
currentSubscription
acceptOrganizationInvitation
switchActiveOrganization
transferOrganizationOwnership
```

Avoid app-specific `admin*` names. Keep `admin` and `__Admin` for framework
admin/generator surfaces.

## Steps

1. If no model extension exists, scaffold one with
   `pnpm nx g @nestledjs/generators:model-extension <Model> --no-interactive`.
2. Add DTOs under `dto/` if the operation needs custom input or output types.
3. Add a model service when the behavior is substantial or reused.
4. Add independent resolver methods to `<model>.resolver.ts`.
5. Do not extend a generated resolver or reuse its operation names.
6. Register any new resolver/provider in `<model>.module.ts`.
7. Add GraphQL operations under `libs/shared/sdk/src/graphql/<feature>`.
8. Run SDK/code generation if operations or schema changed.
9. Register any web route in `apps/web/app/routes.tsx`.

## Security Checks

- Use `GqlAuthGuard` or a stronger guard on user-facing operations.
- Validate organization membership before reading or mutating tenant data.
- Check permissions for role/member/billing/security workflows.
- Do not expose credential material or provider secrets.
- Keep generated admin CRUD admin-only unless the Prisma `@crudAuth` annotation
  intentionally changes it.

## Generation Commands

When Prisma schema or generated GraphQL SDK inputs change:

```bash
pnpm db-update
```

When only SDK GraphQL operations change:

```bash
pnpm sdk
```

## Verification

```bash
pnpm run nestled-doctor
pnpm nx build api
pnpm typecheck
```

Add focused tests for the service or resolver when permissions, tenancy, billing,
or mutation behavior changes.

## Common Mistakes

- Editing `libs/api/generated-crud/*`.
- Extending `Generated<Model>Resolver` from a custom resolver.
- Reusing `create<Model>` or `update<Model>` for a custom mutation.
- Creating custom SDK operations with `__Admin*` names.
- Adding a page component but forgetting `apps/web/app/routes.tsx`.
- Putting cross-model workflow code into a model folder when it should be a
  plugin.
- Calling a third-party SDK directly from a model service instead of injecting an
  integration service.
