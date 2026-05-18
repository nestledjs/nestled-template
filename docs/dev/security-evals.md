# Security Semantic Evals

Nestled Doctor is the local and CI home for deterministic repository invariants that agents often
miss. Semantic security checks should graduate through three stages:

1. Warning-only heuristic in Doctor.
2. Blocking Doctor rule once false positives are understood.
3. LLM-as-judge or human-review workflow when static checks cannot prove the boundary.

## Implemented In Doctor

- Route registration completeness for React Router route files.
- Generated CRUD resolver name collision detection.
- Guard regression detection against `.nestled-template/security/guard-baseline.json`.
- Emulation resolver guard enforcement and service privilege-ceiling enforcement.
- TypeScript unsafe cast audit as warning-only existing debt, with changed-line failures.
- Resolver input scope anchoring as warning-only existing debt, with changed-line failures.
- Audit coverage review signal for sensitive resolver mutations, with changed-line failures.
- Post-release upgrade-note requirement for sensitive template behavior changes.

## Next Promotion Candidates

- Promote TypeScript unsafe casts from warnings to failures after existing source debt is reduced or
  a broader quarantine policy is agreed for tests and provider-boundary code.
- Replace audit coverage sibling-service detection with call-graph tracing so mutations delegated to
  services with audit logging can be proven instead of inferred.
- Add an LLM-as-judge CI comment step for cross-tenant isolation, GraphQL input trust boundaries, and
  test circularity in auth, billing, RBAC, and organization flows.
