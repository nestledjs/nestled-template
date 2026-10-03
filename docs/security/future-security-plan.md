# Future Security Plan

This plan captures the security-verification work that should happen after the first clone baseline.
The pre-clone goal is to establish the contract and prevent new drift. The post-clone goal is to use
the updater pipeline to improve every downstream project incrementally.

## Operating Principle

Security work should move through three stages:

1. Document the invariant in `docs/security` or an ADR.
2. Add a Doctor check, test, or review workflow that detects drift.
3. Promote warning-only checks to blocking once false positives are understood.

## Near-Term Updater Candidates

- Clean production `any` and `@ts-ignore` usage in auth, RBAC, tenancy, billing, webhook, upload,
  Apollo, and shared runtime code.
- Add typed test factories for auth, organization, RBAC, billing, and webhook tests so tests cannot
  depend on impossible object shapes.
- Expand auth security tests for JWT expiry, token isolation, password reset replay, email-change
  token scope, OAuth account-link conflicts, and session invalidation.
- Convert audit-coverage warnings into service-aware checks that can prove a resolver delegates to
  an audited service path.
- Add changed-file LLM review prompts for cross-tenant isolation, GraphQL input trust boundaries,
  and test circularity in auth, billing, RBAC, and organization flows.
- Add a recurring open-handle diagnostic pass for Jest, Vitest, Storybook browser tests, and
  API e2e tests. The goal is to keep CI from masking real leaks behind runner shutdown timeouts.

## Medium-Term Verification Work

- Generate and publish a resolver trust-boundary report from the guard baseline and generated CRUD
  schema.
- Add release-time SBOM generation and retain SBOM artifacts with release metadata.
- Add dependency review records for high-risk packages in auth, crypto, sessions, billing, storage,
  request parsing, and code generation.
- Split runner-infrastructure handle noise from application leaks. Known follow-up areas are Nx
  daemon handles during Vitest runs, Storybook/Playwright browser handles in `web-ui`, and any
  long-lived timers or sockets opened by API test fixtures. CI should keep `NX_DAEMON=false` for
  test runs so daemon IPC does not look like an application leak.
- Add fuzz or property-based tests for external input surfaces such as auth inputs, webhook payloads,
  upload metadata, and GraphQL filter inputs.
- Add a formal security-review checklist for downstream update PRs.

## Promotion Targets

- Promote production type-safety warnings to failures once existing source debt is reduced.
- Promote resolver-scope warnings to failures for new or modified user-facing resolver methods.
- Promote audit coverage from warning-only to failure for sensitive mutations once service-aware
  tracing is reliable.
- Require explicit ADR or security-document updates when changing auth, RBAC, generated CRUD
  defaults, emulation, billing isolation, webhook verification, or upload trust boundaries.

## Not Pre-Clone Blockers

- Eliminating every test `any`.
- Full LLM-as-judge CI integration.
- Complete SBOM release automation.
- Full fuzz coverage.
- Complete auth invariant test suite.
- Fully clean test-runner open-handle warnings across every project.

These are valuable, but they are updater-friendly. The baseline should prevent new drift while the
updater pipeline rolls improvements through downstream projects.
