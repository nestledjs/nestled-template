# Repository Guidelines

## Project Structure & Module Organization

This is an Nx monorepo managed with pnpm. Application code lives in `apps/`: `apps/api` is the NestJS GraphQL API, `apps/web` is the React/React Router web app, and `apps/api-e2e` contains API end-to-end tests. Shared code lives in `libs/`, including backend modules under `libs/api/*`, generated SDK and utilities under `libs/shared/*`, and UI packages under `libs/web-ui`, `libs/web`, `libs/shared-components`, and `libs/data-browser`. Static assets are in `apps/web/public`; helper scripts are in `scripts/`.

## Build, Test, and Development Commands

Use pnpm from the repository root.

- `pnpm install`: install workspace dependencies.
- `pnpm dev:api`: run the API through Nx.
- `pnpm dev:web`: run the web app through Nx.
- `pnpm build:api`: generate Prisma client and build the production API.
- `pnpm build:web`: build the React Router web app.
- `pnpm test`: run Nx test targets.
- `pnpm test:e2e`: run scripted end-to-end tests.
- `pnpm lint`: run workspace and project linting.
- `pnpm format` / `pnpm format:check`: write or check Nx formatting.
- `pnpm typecheck`: generate React Router types and run TypeScript checks for `apps/web`.

## Coding Style & Naming Conventions

TypeScript is the default language. Follow `.editorconfig`: UTF-8, two-space indentation, final newlines, and trimmed trailing whitespace. Prettier uses single quotes, no semicolons, trailing commas, 100-character width, and `arrowParens: avoid`. Use PascalCase for React components, `useCamelCase` for hooks, `*.spec.ts(x)` for tests, and `*.stories.tsx` for Storybook.

## Testing Guidelines

Unit and component tests use Jest and Vitest through Nx project targets. Place tests next to the source they cover when practical, or in existing folders such as `apps/web/tests` and `apps/api-e2e/src`. Run focused checks with Nx, for example `pnpm nx test web-ui` or `pnpm nx e2e api-e2e`. Use `pnpm test:db:start`, `pnpm test:db:reset`, and `pnpm test:db:stop` when tests need the local test database.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often Conventional Commit prefixes such as `feat:` and `chore:`. Keep commits scoped and descriptive, for example `feat: add billing webhook validation`. Before opening a PR, run relevant lint, test, typecheck, and build commands. PRs should include a concise summary, linked issue or task when available, screenshots for UI changes, and notes for migrations, environment variables, or deployment steps.

## Downstream Upgrade Notes

For every meaningful template or published library change, decide whether it should propagate to downstream Nestled projects. If it should propagate, create one upgrade note with `pnpm template:create-upgrade-note --id YYYY-MM-DD-short-description`, then edit the generated `.nestled-template/upgrade-notes/<upgrade-id>.yaml`.

Upgrade notes must describe the downstream behavior or invariant, not just the patch to copy. Set `delivery` to `code-patch`, `package-release`, or `hybrid`. Use `code-patch` for downstream source edits and fill in `affectedPaths`. Use `package-release` for changes shipped through `@nestledjs/data-browser` or `@nestledjs/shared-components` and fill in `packageReleases` so downstream projects update dependency versions instead of copying library source. Use `hybrid` when both are required. Fill in `intent`, `why`, and practical `verification` commands. Use a stable date-prefixed slug, set an appropriate `priority`, `area`, and `type`, and run `pnpm template:validate-upgrade-notes` before finishing.

If a meaningful change should not propagate, either omit the note and explain why in the PR/final response, or add a note with `priority: ignore`. When preparing PR text, include the `Downstream Upgrade` block and mention the upgrade note path when one exists.

## Security & Configuration Tips

Do not commit secrets. Start from `.env.example` and keep local values in `.env`. Be careful with database and cleanup commands; prefer documented Prisma scripts such as `pnpm prisma:generate`, `pnpm prisma:db-push`, and `pnpm prisma:seed`.

## Agent-Specific Instructions

Qalatra agents are registered with `agents/**/agent.config`; do not replace those files with `AGENTS.md`. Use nested `AGENTS.md` files only for contributor and coding guidance that applies to files under that directory.
