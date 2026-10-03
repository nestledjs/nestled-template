# Trust Boundary Map

This map explains how to classify authorization expectations. The committed guard baseline in
`.nestled-updates/security/guard-baseline.json` is the machine-readable snapshot for hand-written
GraphQL resolvers and REST controllers.

## Resolver Classes

| Surface                        | Expected Guard                            | Scope Source                              | Notes                                                                               |
| ------------------------------ | ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Generated CRUD resolvers       | `GqlAuthAdminGuard`                       | Root super administrator                  | Generated CRUD is the root-only management surface.                                 |
| Custom default model resolvers | Operation-specific                        | `@CtxUser()` plus service checks          | Independent additive resolvers; never inherit or collide with generated CRUD.       |
| User organization workflows    | Organization policy or organization guard | `@CtxUser()` membership and role checks   | Caller-supplied organization IDs require membership verification before use.        |
| Billing admin sync             | `GqlAuthAdminGuard`                       | Root administrator and Stripe IDs         | Provider IDs are untrusted until fetched/validated with Stripe.                     |
| User billing workflows         | `GqlAuthGuard`                            | Current user's active organization        | Price IDs are provider references; organization scope comes from the user.          |
| Auth public workflows          | No GraphQL guard                          | Token or credential-specific verification | Login, register, reset, and verification flows must validate their own tokens.      |
| Auth user workflows            | `GqlAuthGuard`                            | `@CtxUser()`                              | Profile/session/password changes apply to the current user unless explicitly admin. |
| Emulation                      | `platform.users.emulate` or root guard    | Actor plus target privilege ceiling       | Service must reject equal or higher privilege targets and every root target.        |
| Storage user uploads           | `GqlAuthGuard`                            | `@CtxUser()`                              | User-owned uploads cannot accept arbitrary user IDs.                                |
| Storage organization uploads   | `GqlOrganizationScopedGuard`              | Verified organization scope               | Organization ID input must match a verified membership.                             |
| Platform operations            | Platform policy decorator                 | Code-owned platform role grants           | Delegated capabilities never imply generated CRUD or data-browser access.           |

## REST Controllers

| Surface                              | Declaration      | Expected Guard or Verification                | Notes                                                                                 |
| ------------------------------------ | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Session-authenticated REST route     | `@Authenticated` | Project authentication guard                  | A declaration does not authenticate; the route still needs a real guard.              |
| Admin REST route                     | `@AdminOnly`     | Admin guard                                   | Prefer method-level overrides when only part of a controller is administrative.       |
| Signed webhook                       | `@Public`        | Provider signature verification               | Record the signature contract in the public-operation allowlist.                      |
| OAuth discovery, authorize, callback | `@Public`        | OAuth state, code, client, or redirect checks | Public protocol entry points still validate all protocol-controlled inputs.           |
| Bearer-token protocol endpoint       | `@Public`        | Protocol-specific bearer-token authentication | Public means no application session; it does not mean skipping protocol verification. |

## Review Rules

- If a resolver accepts an ID in `@Args()`, the service must prove the current user can access that
  entity before using the ID in a read or write.
- If a guard level becomes less restrictive, treat it as a security review item even when tests pass.
- Every resolver operation and controller route must declare `@Public()`, `@Authenticated()`,
  `@AdminOnly()`, or a scoped policy decorator at the method or class level. Protected operations
  also require an actual auth guard; declarations only state intent.
- Every operation without an auth guard must have a written reason in
  `.nestled-updates/security/public-operations.json`.
- If a resolver name looks like generated CRUD (`create<Model>`, `update<Model>`, `<models>Count`,
  `__Admin*`), use a prefixed custom name instead.
- If an operation crosses user, organization, billing, role, or auth state, it should have an audit
  or security-event path.

## Updating The Baseline

Update `.nestled-updates/security/guard-baseline.json` only when the intended resolver or controller
guard contract changes. Stricter guards can usually be accepted with normal review. Less
restrictive guards require an explicit security rationale in the PR and, for template-impacting
changes, an upgrade note.
