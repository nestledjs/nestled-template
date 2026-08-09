# Add an API Plugin

Use this blueprint when adding a cross-model product capability to the API.

## Intent

Create a cohesive NestJS feature module for behavior that spans multiple models
or represents a framework capability.

## When To Use

Use a plugin for:

- auth/session/security workflows
- billing and subscription workflows
- MCP tools and OAuth flows
- admin dashboards and reports
- API tokens
- file/storage product workflows
- cross-model audit or security behavior

Do not use a plugin for a thin third-party SDK wrapper. Use an integration for
that. Do not use a plugin for behavior centered on one Prisma model. Use
`custom/default/<model>` for that.

## Files Touched

Typical paths:

```text
libs/api/custom/src/lib/plugins/<feature>/<feature>.module.ts
libs/api/custom/src/lib/plugins/<feature>/<feature>.resolver.ts
libs/api/custom/src/lib/plugins/<feature>/<feature>.service.ts
libs/api/custom/src/lib/plugins/<feature>/<feature>.controller.ts
libs/api/custom/src/lib/plugins/<feature>/dto/*
libs/api/custom/src/lib/plugins/<feature>/index.ts
libs/api/custom/src/lib/plugins/index.ts
apps/api/src/app.module.ts
apps/api/src/main.ts
```

Not every plugin needs all of these files. Use the smallest module shape that
fits the feature.

## Steps

1. Create `libs/api/custom/src/lib/plugins/<feature>`.
2. Add `<feature>.module.ts`.
3. Add services for product workflow rules.
4. Add resolvers for GraphQL operations when needed.
5. Add controllers for REST/OAuth/webhook style endpoints when needed.
6. Add DTOs under `dto/` for custom GraphQL input/output types.
7. Add `<feature>/index.ts` that exports the module and public services/types.
8. Export the plugin folder from `libs/api/custom/src/lib/plugins/index.ts`.
9. Import and register the module in `apps/api/src/app.module.ts`.
10. If the plugin exposes REST routes, add the route prefix to `VALID_API_PREFIXES`
    in `apps/api/src/main.ts`.

## Naming

Name plugin operations by product capability, not generated CRUD convention.

Good:

```text
syncStripeProducts
generateApiToken
revokeApiToken
mySecurityEvents
uploadUserAvatar
```

Avoid:

```text
create<Model>
update<Model>
delete<Model>
__Admin*
```

Use `admin*` for explicit custom super-admin workflows and `staff*`, `owner*`, or another role name
for lower-privilege role-scoped behavior. Keep `__Admin*` exclusively for generated SDK documents.

## Integration Usage

Plugins may inject integration services, but should not directly initialize or
configure vendor SDKs.

Example:

- `BillingModule` owns subscription workflows.
- `StripeModule` owns the Stripe client wrapper.
- Billing services inject `StripeService`.

## Security Checks

- Put guards on every resolver operation.
- Validate organization membership before tenant reads or writes.
- Check permissions before role/member/billing/security mutations.
- Do not expose provider secrets, credential material, or token hashes.
- Audit sensitive mutations and external side effects.

## Verification

```bash
pnpm run nestled-doctor
pnpm nx build api
```

Add focused service/resolver/controller tests for non-trivial workflows.

## Common Mistakes

- Forgetting to export the plugin from `plugins/index.ts`.
- Forgetting to register the module in `apps/api/src/app.module.ts`.
- Adding a controller but forgetting the early API route allowlist.
- Calling a vendor SDK directly instead of injecting an integration service.
- Using generated CRUD names for custom operations.
