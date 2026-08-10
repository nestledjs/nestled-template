# Scoped RBAC

Nestled has two deliberately separate role scopes:

- **Platform roles** authorize cross-tenant operational work such as user support, audit review,
  analytics, and access-control administration.
- **Organization roles** authorize work inside one verified organization membership.

Do not represent platform access as a role with a null organization ID. Separate persistence keeps
the scope visible in the database, API, UI, audit trail, and migration code.

`User.isSuperAdmin` remains a break-glass root path. It is not the normal way to delegate platform
work, and it must remain available until a downstream application has seeded and verified its root
role recovery procedure.

## Permission catalogs

Permission keys are code-owned. Administrators compose roles from a seeded catalog; they cannot
invent strings in the UI.

Platform keys use a dotted namespace:

```text
platform.users.read
platform.users.manage
platform.access-control.manage
```

Organization keys keep the existing `subject:action` shape:

```text
member:read
member:update
role:create
```

`platform.*`, `namespace.*`, and the legacy organization `all:manage` grant their documented
wildcard scopes. Ordinary `manage` actions do not automatically imply `read`; put both keys in a
role when both capabilities are required.

Add a new key to the relevant seed catalog in the same change as the API operation that consumes
it. Removing or renaming a key is a data migration and API-contract change, not a label edit.

## Declaring API policy

Use a scoped decorator on every role-gated GraphQL operation or REST route:

```typescript
@RequirePlatformPermission('platform.audit.read')
adminAuditLogs() {}

@RequireOrganizationPermission(['member:update'], {
  organizationIdPath: 'input.organizationId',
})
updateOrganizationMember() {}
```

Multiple keys are OR by default. Use `RequireAllPlatformPermissions` or
`RequireAllOrganizationPermissions` only when every listed key is required.

The decorators compose authentication and `AccessPolicyGuard`. Organization policy resolves the
organization named by `organizationIdPath` and verifies membership there; it does not trust the
user's active organization when an operation names a different target.

Do not hide operation-level policy inside resolver bodies with `hasPermission`,
`assertPermission`, or equivalent helpers. Doctor rejects that pattern because it cannot audit the
API contract reliably. A row or object rule still belongs in the service:

```typescript
@RequireOrganizationPermission(['document:update'], {
  organizationIdPath: 'input.organizationId',
})
updateDocument(@CtxUser() user: User, @Args('input') input: UpdateDocumentInput) {
  // The service must still prove that input.documentId belongs to input.organizationId.
}
```

A permission means the caller may attempt the operation. It never proves record ownership, target
membership, state-transition validity, or field visibility.

## Management safety

Role mutation uses purpose-built services and Prisma queries. It never calls generated CRUD.

Both scopes enforce a grant ceiling: callers cannot create, update, assign, revoke, or delete a
role carrying access they do not hold. Default organization roles and the root platform role are
system roles and are immutable through the management APIs. Assigned roles must be emptied before
deletion, and role changes are audited.

Delegated platform user administration has an additional principal ceiling. A caller cannot
modify or emulate a user with equal or higher effective platform access. Nobody may emulate a root
administrator. The same ceiling applies when assigning or revoking roles and when editing a role
that affects existing assignees. Generated CRUD and the data browser remain root-only even when a
platform role has other administrative permissions.

The template's Stripe synchronization and placeholder application-settings surfaces also remain
root-only. Do not add platform permission keys for a future screen: add a key only with the
purpose-built API operation that enforces it.

## Root recovery

Do not expose `isSuperAdmin` through a user-facing resolver or role-management mutation. Keep an
operator-only, audited recovery procedure that sets the boolean for a known user through a reviewed
database migration or production console, reruns the access-control seed to mirror the root role,
and then verifies a newly issued session. The seed also removes root-role assignments from users
whose break-glass boolean has been cleared, so the two representations cannot silently drift.

## User interfaces

`@nestledjs/access-control` is the reusable platform-administrator console. It is a React UI with
an adapter contract, semantic theme tokens, light/dark/system modes, responsive layouts, and
read-only behavior for callers who have `platform.access-control.read` without `manage`. The
package does not know about Apollo, generated SDK code, Prisma, or a downstream application's
routes.

The template's `/admin/access-control` route supplies the GraphQL adapter. Downstream applications
may replace that adapter without forking the package.

Organization permission management stays in the application under `/settings/roles`. That surface
is client-facing and often needs product-specific terminology, seat rules, ownership flows, or
information architecture. Use the template implementation as a secure complete example, not as a
package boundary.

## Adding a capability

1. Add the permission to the code-owned catalog and description.
2. Seed/upsert it without deleting unknown historical data implicitly.
3. Add a scoped decorator to the purpose-built resolver or controller operation.
4. Keep target/row checks and explicit Prisma selection in the service.
5. Add refusal tests for the wrong scope, an insufficient grant, and an invalid target.
6. Add or update an application-owned SDK document and its client.
7. Run Doctor, focused tests, API build, SDK generation, and web typecheck.

For the architectural rationale, see
[Decision 0003](../decisions/0003-scoped-rbac-and-management-surfaces.md).
