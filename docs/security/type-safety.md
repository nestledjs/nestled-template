# Type Safety Policy

TypeScript type escapes are security-relevant in this template. A loose type in auth, RBAC,
billing, tenancy, or provider-boundary code can hide an invalid test shape or an unchecked external
payload.

## Policy

- Do not introduce new `as any`, `as unknown as ...`, or `@ts-ignore` in production source.
- Prefer `unknown` at external trust boundaries, then validate or narrow before use.
- Prefer domain types, `Partial<T>`, `Pick<T, ...>`, `jest.Mocked<T>`, and typed test factories over
  `any` in tests.
- Generated code and provider SDK boundary adapters may need narrow exceptions, but the exception
  should stay close to the boundary and not leak into domain logic.

## Enforcement

`pnpm run nestled-doctor` reports existing unsafe casts as warnings and fails when unsafe casts are
introduced on changed production-source lines. Existing test `any` usage is not a pre-clone blocker,
but security-sensitive tests should move toward typed factories so tests cannot assert impossible
runtime shapes.

## Cleanup Order

1. Auth, RBAC, tenancy, billing, webhook, and upload production code.
2. Shared runtime libraries used by downstream projects.
3. Security-sensitive tests using typed mock factories.
4. Broad test cleanup and low-risk UI tests.
