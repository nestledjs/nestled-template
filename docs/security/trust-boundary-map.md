# Trust Boundary Map

This map explains how to classify authorization expectations. The committed guard baseline in
`.nestled-template/security/guard-baseline.json` is the machine-readable snapshot for hand-written
GraphQL resolvers.

## Resolver Classes

| Surface                        | Expected Guard                                 | Scope Source                              | Notes                                                                               |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Generated CRUD resolvers       | `GqlAuthAdminGuard` by default                 | Admin role                                | Generated CRUD is the super-admin management surface.                               |
| Custom default model resolvers | Operation-specific                             | `@CtxUser()` plus service checks          | Must extend the generated resolver and only add non-colliding methods.              |
| User organization workflows    | `GqlAuthGuard` or `GqlOrganizationScopedGuard` | `@CtxUser()` membership and role checks   | Caller-supplied organization IDs require membership verification before use.        |
| Billing admin sync             | `GqlAuthAdminGuard`                            | Admin role and Stripe IDs                 | Provider IDs are untrusted until fetched/validated with Stripe.                     |
| User billing workflows         | `GqlAuthGuard`                                 | Current user's active organization        | Price IDs are provider references; organization scope comes from the user.          |
| Auth public workflows          | No GraphQL guard                               | Token or credential-specific verification | Login, register, reset, and verification flows must validate their own tokens.      |
| Auth user workflows            | `GqlAuthGuard`                                 | `@CtxUser()`                              | Profile/session/password changes apply to the current user unless explicitly admin. |
| Emulation                      | `GqlAuthAdminGuard`                            | Admin user plus target privilege ceiling  | Service must reject equal or higher privilege targets.                              |
| Storage user uploads           | `GqlAuthGuard`                                 | `@CtxUser()`                              | User-owned uploads cannot accept arbitrary user IDs.                                |
| Storage organization uploads   | `GqlOrganizationScopedGuard`                   | Verified organization scope               | Organization ID input must match a verified membership.                             |
| Admin dashboard operations     | `GqlAuthAdminGuard`                            | Admin role                                | Admin reads and account actions are privileged operational tooling.                 |

## Review Rules

- If a resolver accepts an ID in `@Args()`, the service must prove the current user can access that
  entity before using the ID in a read or write.
- If a guard level becomes less restrictive, treat it as a security review item even when tests pass.
- If a resolver name looks like generated CRUD (`create<Model>`, `update<Model>`, `<models>Count`,
  `__Admin*`), use a prefixed custom name instead.
- If an operation crosses user, organization, billing, role, or auth state, it should have an audit
  or security-event path.

## Updating The Baseline

Update `.nestled-template/security/guard-baseline.json` only when the intended guard contract
changes. Stricter guards can usually be accepted with normal review. Less restrictive guards require
an explicit security rationale in the PR and, for template-impacting changes, an upgrade note.
