# Security Findings — August 2026

Register for the authorization review that started from a downstream penetration report. Each
finding is independent: they sit on different paths, have different owners, and ship on different
release trains. Closing one does not close another, and several were initially mistaken for
duplicates of each other.

`@nestledjs/generators` is authored in the `nestledjs/nestled` repository. Fixes marked **generator**
require a package release before this template can consume them.

## Status

| #   | Finding                                                  | Severity | Lives in             | Reachable by                              | Status                                                |
| --- | -------------------------------------------------------- | -------- | -------------------- | ----------------------------------------- | ----------------------------------------------------- |
| 1   | `@crudAuth` resolved by prefix match, not model identity | critical | generator            | n/a (misconfiguration)                    | Fixed — generators 1.1.4                              |
| 2   | Custom `@crudAuth` level casing mangled                  | low      | generator            | n/a (build failure)                       | Fixed — generators 1.1.4                              |
| 3   | Root operations with no auth guard are fully public      | high     | template             | anonymous                                 | Fixed — doctor check + fail-closed APP_GUARD          |
| 4   | Credential fields exposed in the GraphQL schema          | critical | template             | any caller who can read the row           | Fixed — verified against the live schema              |
| 5   | Arbitrary Prisma `where` injection via `filters`         | critical | template + generator | **anonymous**                             | Fixed — 1.1.5 typed inputs; grammar complete in 1.1.7 |
| 6   | Relation traversal performs no authorization             | high     | template + generator | any caller with one reachable entry point | Fixed — generators 1.1.5 + select-builder check       |

## 1. `@crudAuth` resolved by prefix match

`getCrudAuthForModel` scanned the raw schema for a line starting with `model <Name>` with no word
boundary, so looking up `User` matched `model UserSessionProgress` and returned that model's
annotation. Escalation direction: a model that should default to admin silently inherited a `user`
or `public` level. Operations absent from the hijacked annotation still fell back to admin, giving a
characteristic shape of five user-level operations with `delete` left on admin.

Short names are the vulnerable ones and only in one direction — `User` can be hijacked by
`UserSessionProgress`, never the reverse. Multi-file schema directories make it far more likely,
because files are concatenated alphabetically and the hijacker only has to sort earlier. A pair that
is safe today becomes live on any rename, reorder, or addition.

Fixed by reading `model.documentation` from the Prisma DMMF, which is already bound to the correct
model. This template was never affected: it declares no `@crudAuth` annotations and has no prefix
collisions among its models.

## 2. Custom `@crudAuth` level casing

`getGuardForAuthLevel` lowercased the entire level before capitalising the first character, so
`billingAdmin` produced `GqlAuthBillingadminGuard` — a symbol that does not exist. The convention
documented in AGENTS.md never worked for any multi-word level. Fails loudly at build time rather
than insecurely, but downstream projects had been aliasing their real guard to the mangled name to
make generated code compile.

## 3. Root operations with no auth guard

Before this review, NestJS registered no `APP_GUARD` in this workspace. `GuardsModule` only
_provided_ the guard classes for injection; it did not bind one globally. A resolver method or REST
controller route with no `@UseGuards` was therefore reachable by an anonymous request.

The pre-existing `guard-regression` doctor check iterates the guard baseline, so it catches a guard
being _downgraded_ on a known method but never a new operation that shipped with none.

**Shipped:** a doctor `unguarded-operation` check. Every GraphQL operation and REST controller route
must carry an auth guard or be declared in `.nestled-updates/security/public-operations.json` with a
written reason. The check parses TypeScript classes and methods, attributes class-level decorators
to each route, and does not count a throttler as authentication.

**Also shipped:** `GlobalAuthGuard`, registered as an `APP_GUARD`, refusing any operation that has
not declared an access level via `@Public()`, `@Authenticated()`, or `@AdminOnly()`.

It declares intent rather than authenticating. Global guards run _before_ method guards, so the
request is not yet authenticated when it executes — the attached guard still performs the real
check. A method-level `@UseGuards` does not replace a global guard; both run and both must pass,
which is why binding an admin guard globally would have broken every user-facing operation.

There is no fallback from an attached guard to an access declaration. Generated and hand-written
GraphQL operations plus REST controller routes must explicitly declare `@Public()`,
`@Authenticated()`, or `@AdminOnly()` at the method or class level. An attached guard performs the
real authentication; the declaration records the intended access level.

The original doctor implementation inspected only `*.resolver.ts`, even though the runtime global
guard applied to controllers too. The REST coverage added afterward closes that review gap. The
template's public controllers are allowlisted with reasons because each is reached before an
application session exists or authenticates through a protocol-specific mechanism such as a Stripe
signature, OAuth state/code validation, or an MCP bearer token.

## 4. Credential fields exposed in the GraphQL schema

Nine fields carrying credential material were queryable, and the template's own SDK fragments
selected them — including a non-admin `user-fragments.graphql` pulling password hashes to the
frontend.

| Model    | Fields                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User     | `password`, `passwordResetToken`, `passwordResetExpires`, `validateEmailToken`, `validateEmailTokenExpires`, `twoFactorSecret`, `twoFactorRecoveryCodes` |
| ApiToken | `tokenHash`                                                                                                                                              |
| Email    | `verifyToken`                                                                                                                                            |

`twoFactorSecret` and `twoFactorRecoveryCodes` are the worst of these — readable, they are a complete
2FA bypass, not merely an offline cracking problem.

Fixed with `@graphqlOmit`, which removes the fields from the ObjectTypes, the generated CRUD
Create/Update/**List** inputs, and `DATABASE_MODELS`. Removing them from `ListUserInput` matters
independently: they were filterable, which is a brute-force oracle even without read access.

Prisma row types are unaffected, so server-side code still reads them. This surfaced that
`auth.service.ts` typed database rows with the GraphQL ObjectType rather than the Prisma type,
contrary to the rule in CLAUDE.md; the credential-handling paths now use `PrismaUser`.

`@graphqlOmit` prevents a field being queried or serialized. It does not strip the value from
in-memory Prisma results, and — see finding 5 — it does **not** prevent filtering on the column.

### The public SDK does not self-heal

`sdk/generator.ts:191` does `if (tree.exists(modelDir)) continue` for
`libs/shared/sdk/src/graphql/<model>`, so public SDK operations are generated once and then left
alone to preserve hand edits. Only `__admin` is deleted and rebuilt on every run (line 236).

This cuts both ways. It is why the public `user-fragments.graphql` still selected `password` long
after anyone would have chosen to write that — it was generated once, when the field was in the
schema, and never refreshed. And it means removing the fields from the schema does **not** fix
existing public SDK operations: they keep selecting fields that no longer exist, so `pnpm sdk`
fails at codegen.

Both were cleaned here by hand. Downstream projects must do the same, and the failure will surface
as a codegen error rather than anything mentioning credentials — worth stating plainly in the
upgrade note, because the error does not hint at its own cause. `__admin` needs no manual step.

## 5. Arbitrary Prisma `where` injection via `filters` — FIXED

Every generated list query accepts a caller-supplied `filters` object that reaches Prisma's `where`
clause with no validation, key filtering, or field allow-listing.

- `libs/api/core/data-access/src/lib/dto/core-paging.input.ts` — `filters?: Record<string, unknown>`
  typed `GraphQLJSONObject`, so GraphQL validation accepts any key/value structure
- `libs/api/core/data-access/src/lib/api-core-data-access.service.ts:97-98` —
  `andConditions.push(filters)`, verbatim
- the generator's `List<Model>Input extends CorePagingInput`, so every list query inherits it

Three properties combine: the blob is opaque to GraphQL validation; it is merged into `where`
verbatim, giving the caller the full Prisma filter grammar including relation filters at arbitrary
depth; and Prisma's `where` is built from the _database_ model, not the GraphQL model.

**The third point is why finding 4 does not close this.** Omitted columns still exist in Prisma and
remain filterable, so credentials are extractable one character at a time using result presence as
the oracle signal — roughly 60 requests per character. This recovers `passwordResetToken` and invite
tokens, which are directly usable for account takeover with no cracking step.

Reachability needs only one reachable list query on a model with a relation path to the target.
Anonymous reachability exists wherever a `public` `@crudAuth` level is used, since relation filters
have no depth limit and the reachable set is the transitive closure of the relation graph.

Amplifiers: `take` has no server-side maximum; `orderBy` is interpolated as
`{ [orderBy]: orderDirection }` unvalidated. Query complexity analysis does not help — the plugin
scores document shape, and an oracle query is tiny while `take: 100000` costs the same as `take: 1`.

### Fix design, and why the data browser does not need an exception

The data browser is admin-only and appears to require unbounded filter flexibility. It does not.
It renders from `DATABASE_MODELS` and emits filters from a bounded set of UI components —
`DateRangeFilter` and `NumberRangeFilter` produce `{ gte, lte }`, `EnumFilter` produces equality and
`in`, `RelationFilterField` produces relation filters, and plain fields produce equality or
`contains`.

So the browser only ever filters on **fields present in `DATABASE_MODELS`** using a **known operator
set**. An allow-list derived from `DATABASE_MODELS` covers everything it emits while closing the
oracle — because finding 4 removed the credential columns from `DATABASE_MODELS`. No admin/non-admin
split is required, and the apparent conflict between flexibility and safety dissolves: the exploit
lives in the gap between "any Prisma expression" and "any expression over known columns", which is
not a gap the browser uses.

Finding 4 is therefore a prerequisite for fixing this cleanly, not a detour.

Implementation note: generator 1.1.5 closed the arbitrary-key oracle but omitted AND/OR/NOT,
scalar not, and to-one is/isNot. That made valid existing admin filters fail GraphQL validation,
sometimes only at runtime when the filter object was assembled in TypeScript. Generator 1.1.7
restores those operations without reopening recursion: each logical or relation step points at the
next generated depth, and the deepest input remains scalars-only. Generator 1.1.8 adds the strict
index-signature access required by consumers that enable `noPropertyAccessFromIndexSignature`.

Planned, in order of value:

1. **Generator** — emit typed per-model filter inputs containing only filterable columns, with typed
   operator sub-inputs, excluded by the same predicate that already drives `@graphqlOmit`. GraphQL
   then rejects unknown keys at validation time and the schema becomes self-documenting.
2. **Template** — recursively allow-list keys at the passthrough against `DATABASE_MODELS` and a
   permitted operator set, rejecting anything else. Ships without waiting on a generator release.
3. **Template** — cap `take` server-side and validate `orderBy` against known columns.
4. **Template** — bound relation-filter depth, and consider disallowing relation filters entirely on
   operations reachable without authentication.

## 6. Relation traversal performs no authorization — SUPERSEDED BY ADMIN-ONLY BOUNDARY

The request-scoped traversal authorization described below was the first fix. It is no longer the
template architecture: generated CRUD and its recursive selector are now exclusively admin-only,
while handwritten operations define their own inputs and explicit Prisma queries. Doctor and ESLint
prevent handwritten API code from importing generated CRUD or `createSelect`; there is no
admin-only composition exception.

This removes the lower-privilege generic query compiler instead of maintaining a second model-level
authorization language for it. The historical finding and original fix design remain below because
downstream projects may encounter either architecture during migration.

`createSelect(info)` compiles the whole incoming selection set into a single nested Prisma `select`.
`buildSelectTree` recurses on any field carrying a `relationName`, at unbounded depth, producing one
query that joins across as many tables as the caller asked for.

There is no second guard check because there is no second resolver call — nested data arrives as
extra columns on the root query's result set. There are no `@ResolveField`s on generated models.
Guards protect entry points; a traversal is not an entry point. A guard on `journalEntries` as a root
query is real and works, and has nothing to do with reaching `JournalEntry` rows through a relation.

The enforcement hook is half present, in the wrong copy. There are two generated
`database-models.ts` files, written by two different model loaders that resolve `auth` differently:

| File                                                             | Loader                                                  | Carries `auth`?   |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| `libs/api/generated-crud/data-access/src/lib/database-models.ts` | `crud/generator.ts`, via `getCrudAuthForModel`          | yes — every model |
| `libs/shared/sdk/src/lib/database-models.ts`                     | `getAllPrismaModels` in `lib/engine/generator-utils.ts` | no                |

The second does `auth: authConfig || undefined` where `authConfig` is `parseCrudAuth(documentation)`
with no default merging. With no annotation that is `undefined`, and `JSON.stringify` drops undefined
keys, so the field never reaches the file.

`createSelect` imports `DATABASE_MODELS` from `@<scope>/shared/sdk` — the copy without `auth`. So the
generator fix is to make both loaders resolve auth identically with defaults merged, not to add
emission that was missing entirely.

`ApiCrudDataAccessService` is a plain singleton that calls `createSelect(info)` with no idea who is
asking, so enforcement also needs a viewer. Preferred approach: request-scoped viewer via
`AsyncLocalStorage`, set by a global interceptor, covering generated and custom resolvers without
changing generated method signatures; deny by default when no viewer is present, so an internal or
misconfigured call fails closed. Refuse to recurse into a relation whose target model's read level
exceeds the viewer's, and **throw** naming the field rather than silently dropping it — silent
omission returns partial data that looks like empty results and hides attacks.

## Notes for the downstream rollout

- Findings 1 and 3 fix different halves of the guard problem and neither catches the other. The
  generator repairs _escalated_ guards; doctor catches _missing_ ones. An escalated operation has a
  guard, just the wrong one, so doctor passes it clean.
- Regenerating flips escalated models back to admin. That is a behaviour change, not only a security
  fix. Check for non-admin root-level callers of the affected operations before deploying, or the
  fix becomes an outage. Nested field selections inside fragments are unaffected; only root-level
  calls matter.
- Projects using any `@crudAuth` level must replace the lowered operation with a purpose-built
  resolver, DTO, guard, and user/tenant-scoped Prisma query. The current Doctor rejects the
  annotation rather than treating it as a public-operation allow-list concern.
