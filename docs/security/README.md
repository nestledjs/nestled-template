# Security Verification

This directory describes the security model that repository checks, tests, and AI review tools
should verify. Treat these files as specifications, not background reading.

## Core Documents

- [Threat Model](./threat-model.md) states the assets, adversaries, trust boundaries, and security
  invariants the template is designed to preserve.
- [Auth Invariants](./auth-invariants.md) lists testable auth guarantees and the verification path
  for each guarantee.
- [Scoped RBAC](./scoped-rbac.md) defines platform and organization role scopes, declarative API
  policy, grant ceilings, and the reusable-versus-local UI boundary.
- [Trust Boundary Map](./trust-boundary-map.md) maps resolver guard expectations and explains how
  generated CRUD, custom user operations, and admin-only operations differ.
- [Type Safety Policy](./type-safety.md) defines how unsafe TypeScript escapes are handled.
- [Dependency Review](./dependency-review.md) defines the minimum review process for new
  dependencies and release-time supply chain checks.
- [Future Security Plan](./future-security-plan.md) captures post-clone security work to roll out
  through the updater pipeline.

## Maintenance Rule

Any change to auth, billing, RBAC, organization membership, file upload, generated CRUD security, or
admin behavior should either update these documents or explicitly state why the existing security
model still applies.
