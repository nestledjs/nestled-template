# Threat Model

## Scope

This threat model covers the Nestled template API, web app, generated CRUD surface, auth/session
system, organization tenancy, billing integration, file upload/delivery, and admin operations.

## Assets

- User identities, credentials, sessions, password reset material, OAuth account links, and two
  factor authentication secrets.
- Organization data, membership, roles, invitations, billing subscriptions, and usage records.
- Admin-only operational data, including audit logs, security events, generated CRUD access, and
  account-management tools.
- Uploaded files and provider credentials for storage, email, billing, OAuth, and webhooks.

## Assumed Adversaries

- Anonymous internet users attempting account takeover, registration abuse, password reset abuse,
  or token replay.
- Authenticated users attempting horizontal access to another user or organization.
- Organization members attempting privilege escalation inside their organization.
- Admin users attempting actions outside their privilege ceiling.
- External services or webhooks sending malformed, replayed, or forged payloads.
- Compromised or malicious dependencies in high-risk areas such as auth, crypto, sessions, billing,
  storage, and request parsing.

## Trust Boundaries

- Browser to API: all GraphQL and HTTP input is untrusted, including IDs supplied by authenticated
  users.
- API to database: Prisma queries must enforce user and organization scope before returning or
  mutating protected data.
- API to external providers: webhook signatures and provider identifiers must be validated before
  state changes.
- Generated CRUD to custom workflows: generated CRUD is always admin-only; user workflows belong in
  custom resolvers with explicit inputs, scope checks, and Prisma queries. Handwritten workflows
  never compose generated CRUD, even when they are admin-only.
- Admin to super admin: admin-only tooling must not become a path to assume equal or higher
  privilege.

## Global Invariants

- A user can never read or mutate another user's private data unless an explicit admin-only workflow
  allows it.
- A user can never read or mutate another organization's data by supplying a different
  `organizationId` or related entity ID.
- Generated CRUD operations remain admin-only without exceptions.
- Apart from app-module registration of the generated feature module, handwritten resolvers and
  services cannot import generated CRUD inputs, data-access services, resolvers, or the recursive
  GraphQL selection compiler.
- User-facing custom resolvers derive scope from `@CtxUser()` and verified memberships, not from
  caller-supplied IDs alone.
- Security-sensitive mutations are auditable, either through audit logs or security events.
- Emulation can only be started by a super-admin guarded resolver and cannot target a user with
  equal or higher privilege.
- Token, session, reset, OAuth, webhook, and upload inputs are rejected when expired, replayed,
  malformed, or unauthenticated.

## Verification Hooks

- `pnpm run nestled-doctor` checks repository invariants and warning-class review signals.
- Auth invariants are tracked in [Auth Invariants](./auth-invariants.md).
- Resolver guard expectations are tracked in
  `.nestled-updates/security/guard-baseline.json` and summarized in
  [Trust Boundary Map](./trust-boundary-map.md).
- Downstream propagation decisions are tracked with `.nestled-updates/upgrade-notes/*.yaml`.
