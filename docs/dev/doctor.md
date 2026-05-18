# Nestled Doctor

`pnpm run nestled-doctor` runs repository invariant checks that are easy for humans and AI
agents to miss during feature work.

The script name is intentionally explicit to avoid collisions with package-manager
or framework commands such as `pnpm doctor` or `expo doctor`.

## Checks

- Web route files are registered in `apps/web/app/routes.tsx`.
- Registered route files exist.
- Direct `@prisma/client` imports are not used for project Prisma types.
- Stale legacy frontend URL config names are absent.
- MCP plugin registration matches API endpoint filtering.
- Registered Nest API controller routes are covered by `VALID_API_PREFIXES`.
- Default model resolvers keep generated admin CRUD registered and avoid generated
  field-name collisions.
- Hand-written `__Admin*` SDK operations stay out of normal SDK operation folders.
- Plugin modules are exported and registered in the API app module.
- Integration modules/services are exported through integration barrels.
- `@skipCrud` includes a nearby security-sensitive internal-model explanation.
- Publishable packages include a README.
- Sensitive auth, billing, admin, API, or route changes include a new upgrade note or an explicit
  `priority: ignore` note when Doctor is running in the source template repository.
- Custom resolver guard levels do not regress below the committed guard baseline in
  `.nestled-template/security/guard-baseline.json`.
- Non-generated TypeScript source avoids `as any`, double-casting through `unknown`, and
  `@ts-ignore`. Existing findings are warning-only; findings on changed lines fail.
- Emulation or impersonation code requires `GqlAuthAdminGuard` and an explicit privilege ceiling.
- Resolver methods that use caller-supplied IDs in data access without an obvious `@CtxUser`
  scope anchor are flagged for review. Changed-line findings fail.
- Sensitive auth, organization, billing, admin, RBAC, and user mutations without obvious audit
  logging in the resolver file or a sibling service are flagged for review. Changed-line findings
  fail.

Future checks should also validate that normal SDK operation files do not call
generated CRUD fields directly after the remaining legacy SDK operations are
retired or moved to `__admin`.

## Guard Baseline

The guard baseline captures the effective guard list for each hand-written GraphQL resolver
operation under `libs/api/custom/src/lib`. Doctor blocks changes that downgrade an existing
operation's guard level, such as changing `GqlAuthAdminGuard` to `GqlAuthGuard`.

When a guard change is intentionally stricter, update `.nestled-template/security/guard-baseline.json`
in the same PR. When a guard change is intentionally less restrictive, treat it as a security review
item and document the reason in the PR.

Regenerate the baseline after reviewing an intentional guard-contract change:

```bash
pnpm security:update-guard-baseline
```

## Usage

```bash
pnpm run nestled-doctor
```

## Source Template Mode

Upgrade notes are a source-template responsibility. Doctor only enforces the upgrade-note gate when
it can identify the repository as `github.com/nestledjs/nestled-dev-template` or
`github.com/nestledjs/nestled-template`, or when `NESTLED_TEMPLATE_SOURCE=true` is set.

Downstream projects can still keep `.nestled-template/upgrade-notes` so the updater can read
inbound notes, but they should not be required to create new notes for local application changes.
Set `NESTLED_TEMPLATE_SOURCE=false` in unusual clone setups where the remote still points at the
source repository during local downstream work.

Doctor is intentionally fast and local. It does not replace builds, tests, or
type checks; it catches framework-specific drift before those checks become
harder to interpret.
