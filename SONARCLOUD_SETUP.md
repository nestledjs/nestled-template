# SonarCloud Setup

SonarCloud is run from GitHub Actions for this project via the `SonarCloud Scan`
workflow step. The scanner reads `sonar-project.properties` from the repository
root for source, coverage, and duplication exclusions.

Do not enable SonarCloud Automatic Analysis for this repository at the same time
as the GitHub Action. Automatic Analysis ignores local scanner configuration and
can report different issues than CI.

Keep file/path exclusions in `sonar-project.properties`. Use the SonarCloud UI
only for project identity, quality gate settings, and rare rule suppressions that
cannot be represented in scanner properties.

---

## Analysis Scope → Source File Exclusions

Add each path as a separate entry:

```
libs/api/generated-crud/**
libs/api/core/models/**
libs/shared/sdk/src/generated/**
libs/shared/sdk/src/lib/database-models.ts
libs/api/prisma/src/lib/prisma-generated/**
libs/api/prisma/src/lib/schemas/migrations/**
libs/api/prisma/src/lib/seed/seed-data/**
**/*.md
**/vite.config.ts
```

---

## Analysis Scope → Duplication Exclusions

```
libs/api/generated-crud/**
libs/api/core/models/**
libs/shared/sdk/src/generated/**
libs/shared/sdk/src/lib/database-models.ts
libs/api/prisma/src/lib/prisma-generated/**
libs/api/prisma/src/lib/seed/seed-data/**
**/vite.config.ts
**/*.spec.ts
**/*.spec.tsx
```

---

## Analysis Scope → Coverage Exclusions

```
**/*.spec.ts
**/*.spec.tsx
**/*.stories.ts
**/*.stories.tsx
**/jest.config.ts
**/jest.config.js
**/vite.config.ts
**/jest.setup.ts
libs/api/generated-crud/**
libs/shared/sdk/src/generated/**
libs/api/prisma/src/lib/prisma-generated/**
```

---

## Issues → Ignore Issues on Multiple Criteria

Add one row per entry below. Each row requires a **Rule Key** and a **File Path Pattern**.

These suppress rules that are systematically noisy in test and story files but remain
active in production code. Real bugs (e.g. `typescript:S6440` React hooks violations)
are intentionally not suppressed.

| Rule Key           | File Path Pattern                   | Reason                                                                                                  |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `typescript:S3776` | `**/*.spec.ts`                      | Cognitive complexity — test setups are legitimately complex                                             |
| `typescript:S3776` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S2004` | `**/*.spec.ts`                      | Deep nesting — describe/it blocks create real nesting                                                   |
| `typescript:S2004` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S1854` | `**/*.spec.ts`                      | Useless assignment — common pattern: `const x = render(...)` then reassign                              |
| `typescript:S1854` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S4325` | `**/*.spec.ts`                      | Unnecessary type assertion — needed for TypeScript `expect()` ergonomics                                |
| `typescript:S4325` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7762` | `**/*.spec.ts`                      | prefer `remove()` over `removeChild()` — DOM teardown patterns in tests                                 |
| `typescript:S7762` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7721` | `**/*.spec.ts`                      | Function scope — inline test helpers are intentional                                                    |
| `typescript:S7721` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S6848` | `**/*.spec.tsx`                     | Accessibility — not enforced in test files                                                              |
| `typescript:S6848` | `**/*.stories.tsx`                  | Accessibility — not enforced in Storybook stories                                                       |
| `typescript:S6853` | `**/*.spec.ts`                      | Form label association — not enforced in test files                                                     |
| `typescript:S6853` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S2137` | `**/*.stories.tsx`                  | "Error" variable name — Storybook convention for error-state stories                                    |
| `typescript:S7764` | `**/*.spec.ts`                      | globalThis preference — test mocks intentionally use `global`                                           |
| `typescript:S7764` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S1128` | `**/*.spec.ts`                      | Unused imports — common in test helpers and shared fixtures                                             |
| `typescript:S1128` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7780` | `**/*.spec.ts`                      | String.raw preference — not required in test utility strings                                            |
| `typescript:S7780` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S4623` | `**/*.spec.ts`                      | Redundant undefined — common pattern in test helper optional params                                     |
| `typescript:S4623` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7723` | `**/*.spec.ts`                      | new Array() preference — explicit array construction in test data factories                             |
| `typescript:S7723` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S2486` | `**/*.spec.ts`                      | Empty catch — intentional in test teardown and error-boundary tests                                     |
| `typescript:S2486` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7744` | `**/*.spec.ts`                      | Empty object useless — common in test mocks and stubs                                                   |
| `typescript:S7744` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S3358` | `**/*.spec.ts`                      | Nested ternaries — used in test assertion helpers                                                       |
| `typescript:S3358` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S4030` | `**/*.spec.ts`                      | Unused collection — intermediate collections in test setup                                              |
| `typescript:S4030` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S3863` | `**/*.spec.ts`                      | Duplicate imports — test files may import same symbol from multiple paths                               |
| `typescript:S3863` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S6479` | `**/*.spec.tsx`                     | Array index keys — acceptable in test renders where stable IDs are not needed                           |
| `typescript:S7735` | `**/*.spec.ts`                      | Negated condition — used in test assertions for readability                                             |
| `typescript:S7735` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7773` | `**/*.spec.ts`                      | Number methods preference — test data uses legacy number coercion patterns                              |
| `typescript:S7773` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S7772` | `**/*.spec.ts`                      | node: imports — not required in test files                                                              |
| `typescript:S7772` | `**/*.spec.tsx`                     |                                                                                                         |
| `typescript:S3863` | `**/*.stories.tsx`                  | Duplicate imports — Storybook story files may import from multiple paths                                |
| `typescript:S1128` | `**/*.stories.tsx`                  | Unused imports — Storybook decorators and args often appear unused                                      |
| `typescript:S2068` | `apps/api-e2e/**`                   | Hardcoded credentials — test credentials are intentional in e2e fixtures                                |
| `typescript:S3776` | `apps/api-e2e/**`                   | Cognitive complexity — e2e test flows are legitimately complex                                          |
| `typescript:S2486` | `apps/api-e2e/**`                   | Empty catch — intentional in e2e cleanup handlers                                                       |
| `typescript:S7772` | `apps/api-e2e/**`                   | node: imports — not required in e2e test files                                                          |
| `typescript:S7764` | `apps/api-e2e/**`                   | globalThis preference — e2e mocks may use `global`                                                      |
| `typescript:S3776` | `scripts/validate-upgrade-notes.ts` | Cognitive complexity — excluded per project decision; complexity is inherent in schema validation logic |
| `shelldre:S7682`   | `scripts/*.sh`                      | Explicit return at end of shell functions — add `return 0` or `return $?`                               |
| `shelldre:S7688`   | `scripts/*.sh`                      | Use `[[` instead of `[` for conditional tests in bash                                                   |

---

## Important Notes on Suppression Methods

**Prefer scanner configuration over inline suppression.**
Use `sonar-project.properties` for source, duplication, generated-code, and
coverage exclusions. Avoid `// NOSONAR` unless there is a narrow, documented
reason.

**Do not add `.sonarcloud.properties`.**
The Sonar scanner uses `sonar-project.properties`; a second similarly named file
creates ambiguity and is easy to leave out of sync.

**If Automatic Analysis is enabled, disable it.**
This repo expects CI-based analysis so the checked-in `sonar-project.properties`
is honored.
