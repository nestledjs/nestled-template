# Repository Guidelines

## Project Overview

**Nestled Template** is a production-ready SaaS starter template with auth, profiles, organizations/teams, RBAC, billing/subscriptions, admin area, and audit logging. Built as an Nx monorepo with a NestJS GraphQL API and React web frontend.

**Key Stack:**

- **Monorepo:** Nx with pnpm
- **API:** NestJS + GraphQL + Prisma (PostgreSQL)
- **Web:** React with React Router v7 + Apollo Client
- **Shared:** Generated GraphQL SDK, TypeScript utilities

## Project Structure & Module Organization

Application code lives in `apps/`: `apps/api` is the NestJS GraphQL API, `apps/web` is the React/React Router web app, and `apps/api-e2e` contains API end-to-end tests. Shared code lives in `libs/`:

- `libs/api/*` — Backend libraries:
  - `config` — Configuration module
  - `core` — Core business logic and models
  - `custom` — Custom resolvers and plugins
  - `generated-crud` — Auto-generated CRUD resolvers (do not edit)
  - `integrations` — External service integrations (Stripe, email, storage)
  - `prisma` — Prisma client and database utilities
  - `utils` — Backend utilities (guards, decorators, helpers)
- `libs/shared/*` — Isomorphic code:
  - `apollo` — Apollo Client configuration
  - `sdk` — Generated GraphQL SDK (TypeScript types + operations)
  - `styles` — Shared styles
  - `utils` — Shared utilities
- `libs/web/*` — Web-specific helpers/components
- `libs/web-ui` — Low-level UI primitives (Storybook available)
- `@nestledjs/shared-components` — Published shared React components consumed as a dependency
- `@nestledjs/data-browser` — Published admin data browsing UI consumed as a dependency

Static assets are in `apps/web/public`; helper scripts are in `scripts/`.

## Build, Test, and Development Commands

Use pnpm from the repository root.

### Install & Setup

```bash
pnpm install
cp .env.example .env   # then edit DATABASE_URL and other secrets
pnpm nx run api-prisma:generate
pnpm prisma:seed
```

### Running the Apps

```bash
pnpm dev:api      # API server (localhost:3000)
pnpm dev:web      # Web app (separate terminal)
```

### Building

```bash
pnpm build:api
pnpm build:web
pnpm nx build <project-name>
```

### Testing

```bash
pnpm test                          # run Nx test targets
pnpm test:e2e                      # scripted end-to-end tests
pnpm nx test <project-name>        # focused project test
pnpm nx e2e api-e2e                # API e2e tests

# Test database management (port 5433, separate from dev DB on 5432)
pnpm test:db:start
pnpm test:db:reset
pnpm test:db:stop
./scripts/test-db.sh start|stop|reset|migrate
```

### Linting & Formatting

```bash
pnpm lint               # run workspace and project linting
pnpm format             # write Nx formatting
pnpm format:check       # check formatting
pnpm typecheck          # generate React Router types + TypeScript checks for apps/web
```

### Prisma Operations

```bash
pnpm prisma:generate    # generate Prisma client
pnpm prisma:format      # format schema
pnpm prisma:db-push     # push schema to DB
pnpm prisma:seed        # seed database
pnpm prisma:reset       # reset database (destroys data)
pnpm prisma:studio      # open Prisma Studio
```

### Code Generation

```bash
pnpm db-update          # full regen: Prisma → CRUD resolvers → Models → SDK
pnpm sdk                # generate GraphQL SDK only
pnpm sdk:watch          # watch mode for SDK generation
pnpm generate:models    # generate TypeScript models from Prisma
```

### Docker

```bash
pnpm docker:build
pnpm docker:up
pnpm docker:down
pnpm docker:logs
```

## Coding Style & Naming Conventions

TypeScript is the default language. Follow `.editorconfig`: UTF-8, two-space indentation, final newlines, trimmed trailing whitespace. Prettier uses single quotes, no semicolons, trailing commas, 100-character width, `arrowParens: avoid`. Use PascalCase for React components, `useCamelCase` for hooks, `*.spec.ts(x)` for tests, `*.stories.tsx` for Storybook.

## Testing Guidelines

Unit and component tests use Jest and Vitest through Nx project targets. Place tests next to the source they cover when practical, or in existing folders such as `apps/web/tests` and `apps/api-e2e/src`. Run focused checks with Nx, e.g. `pnpm nx test web-ui` or `pnpm nx e2e api-e2e`.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often Conventional Commit prefixes such as `feat:` and `chore:`. Keep commits scoped and descriptive, e.g. `feat: add billing webhook validation`. Before opening a PR, run relevant lint, test, typecheck, and build commands. PRs should include a concise summary, linked issue or task when available, screenshots for UI changes, and notes for migrations, environment variables, or deployment steps.

## Downstream Upgrade Notes

Every meaningful template or published library change must explicitly decide whether it should propagate to downstream Nestled projects.

Upgrade-note creation is a source-template responsibility for this repository and the public
template repository (`github.com/nestledjs/nestled-dev-template` and
`github.com/nestledjs/nestled-template`). Downstream projects may keep the
`.nestled-updates/upgrade-notes` directory so the updater can read inbound notes, but local
downstream application changes should not be forced to create new template upgrade notes. Doctor
enforces this gate only when it identifies one of those source repositories, or when
`NESTLED_TEMPLATE_SOURCE=true` is set.

### When a Change Should Propagate

Create one upgrade note:

```bash
pnpm template:create-upgrade-note --id YYYY-MM-DD-short-description
```

Then edit `.nestled-updates/upgrade-notes/<upgrade-id>.yaml`.

The note should describe the downstream behavior or invariant, not just the files to copy. Downstream projects may have diverged, so agents need the concept, expected behavior, propagation method, affected path or package hints, skip conditions, and verification path.

Required fields for propagating notes:

- `id` - must match the filename without `.yaml`
- `title`
- `priority` - `critical`, `high`, `normal`, `low`, or `ignore`
- `area` - `auth`, `billing`, `admin`, `ui`, `api`, `web`, `database`, `infra`, or `docs`
- `type` - `security`, `correctness`, `feature`, `infra`, `deps`, `design`, `docs`, or `cleanup`
- `delivery` - `code-patch`, `package-release`, or `hybrid`
- `intent`
- `why`

For `delivery: code-patch`, include `affectedPaths`; downstream projects should adapt local source files.

For `delivery: package-release`, include `packageReleases`; downstream projects should update package versions for `@nestledjs/data-browser` or `@nestledjs/shared-components` instead of copying package source into the template.

For `delivery: hybrid`, include both `affectedPaths` and `packageReleases`.

Recommended fields: `skipIf`, `verification`, `agentHints`.

Good `intent` example:

```yaml
intent: >
  Reject expired sessions inside API resolver auth checks before any protected data is loaded.
```

Weak `intent` example:

```yaml
intent: >
  Copy the new auth middleware file.
```

Before finishing, run:

```bash
pnpm template:validate-upgrade-notes
```

### When a Change Should Not Propagate

Either omit an upgrade note and explain why in the PR/final response, or add a note with `priority: ignore`.

For PR descriptions, include the `Downstream Upgrade` block and mention the upgrade note path when one exists:

```markdown
## Downstream Upgrade

- Propagate downstream: yes
- Upgrade note: `.nestled-updates/upgrade-notes/<upgrade-id>.yaml`
- Area: auth
- Priority: high
- Verification: `pnpm lint`, `pnpm test`
```

## @crudAuth System for Declarative Security

This project uses a custom `@crudAuth` annotation system in the Prisma schema to declaratively configure CRUD authorization at the model level.

### How it works

Add a comment above any model in `/libs/api/prisma/src/lib/schemas/schema.prisma`:

```prisma
/// @crudAuth: { "readOne": "user", "readMany": "user", "create": "user", "update": "user", "delete": "user" }
model UserPreference {
  id        String   @id @default(uuid())
  // ... rest of model
}
```

### Auth Levels

- `"admin"` - Uses `GqlAuthAdminGuard` (default for all operations)
- `"user"` - Uses `GqlAuthGuard` (authenticated user)
- `"custom"` - Uses a custom guard (e.g., `"organizationOwner"` would require `GqlAuthOrganizationOwnerGuard` in `/libs/api/utils/src/lib/guards/`)

### CRUD Operations

Configure security for: `readOne`, `readMany`, `count`, `create`, `update`, `delete`.

**Best practice:** Only specify non-admin levels. Since all operations default to `"admin"`, only include operations you want to change.

### Custom Resolvers and Generated CRUD

Generated CRUD methods and generated SDK admin operation names are reserved. Do not edit
`libs/api/generated-crud/*`, do not override generated CRUD methods, and do not create custom
operations that reuse generated names such as `create<Model>`, `update<Model>`, `delete<Model>`,
`<model>`, `<models>`, `<models>Count`, or `__Admin*`.

Default model resolver classes under `libs/api/custom/src/lib/default/<model>` must extend
`Generated<Model>Resolver`. This inheritance is the required pass-through adapter that keeps
generated admin CRUD registered for the model. Custom operations in these classes must be additive
only; never override inherited generated methods.

For custom user-facing operations, use names that cannot collide with generated admin CRUD:

```typescript
@Resolver(() => Organization)
export class OrganizationResolver extends GeneratedOrganizationResolver {
  @Mutation(() => Organization)
  userCreateOrganization(@CtxUser() user: User, @Args('input') input: CreateOrganizationInput) {
    // Custom model-specific workflow.
  }
}
```

For cross-model features, create a separate plugin resolver under
`libs/api/custom/src/lib/plugins/<feature>` instead of adding unrelated behavior to a default model.

### Standard Pattern Summary

1. Every model gets generated admin CRUD (organization, createOrganization, updateOrganization, etc.)
2. User-specific operations get custom resolvers (myOrganizations, userCreateOrganization, etc.)
3. Avoid `@skipCrud` except for documented security-sensitive internal models
4. Default model resolvers must extend generated resolvers and only add non-colliding custom methods
5. Admin operations are admin-only by default
6. User operations are in separate resolvers with clear naming

## CRUD Generation and Security-Sensitive Exceptions

**DEFAULT PRINCIPLE**: Generate admin CRUD for every normal application model. Do not use
`@skipCrud` to avoid authorization work, hide incomplete models, or create user-specific behavior.
Generated CRUD gives super admins a predictable management surface; custom user workflows belong in
separate resolvers.

`@skipCrud` is allowed only for explicitly documented security-sensitive internal models where even
super-admin generic browsing would be risky or misleading, such as password hash history, token
material, provider secrets, or one-way credential artifacts. When using `@skipCrud`, add a comment
above the model explaining why generated admin CRUD must not exist and provide any necessary custom
maintenance path.

For normal models, generated CRUD uses standard names; custom resolvers use prefixed names. When you
need user-specific operations, create a separate resolver:

```typescript
@Resolver(() => Organization)
export class UserOrganizationResolver {
  @Query(() => [Organization])
  myOrganizations(@CtxUser() user: User): Promise<Organization[]> { ... }

  @Mutation(() => Organization)
  userCreateOrganization(@CtxUser() user: User, @Args('input') input: CreateOrganizationInput): Promise<Organization> { ... }
}
```

**WRONG** ❌:

```prisma
/// @skipCrud  // Do not use this for normal application models.
model Organization { ... }
```

**ACCEPTABLE** ✅:

```prisma
/// @skipCrud
/// Security-sensitive internal credential history. Password hashes should not be exposed
/// through generic admin CRUD or the admin data browser.
model PasswordHistory { ... }
```

## Prisma Import Paths

**CRITICAL**: Always import Prisma types from the project's wrapper, NOT from `@prisma/client` directly.

```typescript
// ✅ CORRECT
import { PrismaClient, User, Upload, StorageProvider } from '@nestled-template/api/prisma'

// ❌ WRONG — will cause build errors
import { User } from '@prisma/client'
```

**Why**: This project uses a custom Prisma wrapper at `@nestled-template/api/prisma`. Importing directly from `@prisma/client` will fail because types are generated in a custom location.

## Route Registration — CRITICAL WORKFLOW STEP

**CRITICAL RULE**: Every time you create or move a page component, you MUST update the route configuration in `/apps/web/app/routes.tsx`.

Routes are NOT auto-discovered from the file system. Without route registration, pages will 404 even if the file exists.

```typescript
// apps/web/app/routes.tsx
export default [
  route('', './routes/_layout.tsx', [
    route('', './routes/_authenticated/_layout.tsx', [
      route('admin', './routes/admin/_layout.tsx', [
        index('./routes/admin/_index.tsx'),
        route('users', './routes/admin/users/_index.tsx'),
        route('audit-logs', './routes/admin/audit-logs/_index.tsx'), // ← new pages go here
      ]),
    ]),
  ]),
] satisfies RouteConfig
```

## Code Generation Workflow

After making changes to the Prisma schema:

1. Update schema annotations in `/libs/api/prisma/src/lib/schemas/schema.prisma`
2. Run `pnpm db-update` to regenerate:
   - Prisma client
   - GraphQL resolvers with updated guards
   - GraphQL schema types
   - TypeScript SDK
3. Generated code appears in:
   - `/libs/api/generated-crud/feature/` — Resolvers
   - `/libs/api/generated-crud/data-access/` — Data access services
   - `/libs/shared/sdk/` — TypeScript SDK for frontend

## API Server Management

**IMPORTANT**: Never attempt to automatically restart the API server. Always ask the user to restart it manually.

**Why**: The project may have multiple background API processes, custom startup configurations, or development workflows that cannot be safely managed automatically.

## Auto-Generated Files and Safe Export Patterns

The following files are overwritten when running `pnpm db-update`:

- `/libs/api/custom/src/index.ts` — Main barrel export file
- `/libs/api/custom/src/lib/default/index.ts` — Default resolvers export

**Safe pattern**: Add exports to `/libs/api/custom/src/lib/plugins/index.ts` (this file is preserved through codegen). The auto-generated `index.ts` always includes `export * from './lib/plugins'`, so anything exported from plugins remains accessible.

## Auth & Security

**Authorization Guards:**

- `GqlAuthAdminGuard` — Super admin only (default for generated CRUD)
- `GqlAuthGuard` — Authenticated user
- Custom guards in `libs/api/utils/src/lib/guards/`

**GraphQL Schema:** Auto-generated at `api-schema.graphql` (do not edit manually). SDK is generated from this schema + `.graphql` operation files in `libs/shared/sdk/src/graphql/` and `libs/shared/sdk/src/__admin/`.

## Billing & Integrations

**Stripe:** Configured via environment variables. See README.md "Billing & Stripe Setup" for webhook setup and product sync instructions. Stripe variables (`STRIPE_SECRET_KEY`, etc.) are optional — billing features are disabled if not set.

**Required environment variables:** `DATABASE_URL`, `JWT_SECRET`. See `.env.example` for all options.

## Security & Configuration Tips

Do not commit secrets. Start from `.env.example` and keep local values in `.env`. Be careful with database and cleanup commands; prefer documented Prisma scripts such as `pnpm prisma:generate`, `pnpm prisma:db-push`, and `pnpm prisma:seed`.

## SonarQube Quality Expectations

This repository is kept clean under SonarQube. When editing code, proactively avoid common Sonar findings instead of relying on a later cleanup pass:

- Keep functions small and focused. If a function starts accumulating nested branches, loops, or mixed responsibilities, extract named helpers before cognitive complexity becomes high.
- Avoid deeply nested control flow. Prefer early returns, guard helpers, and small validation functions.
- Do not use regexes that can backtrack heavily on malformed input. Prefer simple anchored patterns, `RegExp.exec()` loops for repeated matches, or explicit parsers/scanners for non-trivial parsing.
- Do not rely on default object stringification. Before converting unknown values to strings, explicitly handle objects with `JSON.stringify`, domain labels, or selected fields.
- Avoid dead fallback branches such as `typeof value === 'object' ? ... : String(value)` after an object branch already returned; Sonar may still flag these as unclear.
- Keep generated, doctor, script, and test-support code clean too. Do not exclude files from Sonar just because they are internal unless there is a deliberate project decision.

Before finishing non-trivial changes, run the relevant local checks:

```bash
pnpm run nestled-doctor
pnpm format:check
pnpm nx test <affected-project>
pnpm nx build <affected-project>
```

## Agent-Specific Instructions

Qalatra agents are registered with `agents/**/agent.config`; do not replace those files with `AGENTS.md`. Use nested `AGENTS.md` files only for contributor and coding guidance that applies to files under that directory.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
