# Template Upgrade Notes

> **`archive/` is history, not a backlog.** Notes there predate the convergence reset
> (2026-08-19) and must not be replayed or counted as a gap. A repo's standing is measured by
> `.nestled/converged-at` against the template's HEAD — see `archive/README.md`.

Add one YAML file here for each template or published library change that should be
reviewed by downstream Nestled projects.

Upgrade notes describe intent, not just diffs. Downstream projects may have diverged,
so the upgrader and coding agents use these notes to decide whether to apply a local
code patch, update a published package dependency, adapt, skip, supersede, or block
each change.

## Writing notes for a public audience

This repository is public, and so is every note in it. Describe the defect, its impact and
the fix relative to the template. Never name the project, client, site or private repo
where a problem was found ("a downstream project hit this" is enough), and never link a
private repo, pull request or commit. A security note describes the fix only after it has
shipped; the details belong in the security advisory.

## Before you publish a note

Notes are read by agents in projects that differ from this repository. Check these before a note
goes out; each one has cost a downstream rollout time.

- **`affectedPaths` lists only files a downstream project can have.** This repository carries
  dev-template-only files that promotion does not copy to `nestled-template` (for example
  `agents/**`, including `agents/debugging-playbook.md`, `docs/dev/**` and `ai-docs/**`). Do not
  list one as an affected path. If the change also updates such a file, say in the intent that it
  is a dev-template-only file and needs no downstream action.
- **Verification proves the change, not the cache.** A change Nx does not hash (a Node or
  toolchain version, an environment default, a file outside a project's inputs) leaves earlier
  results cached, and a cached green run proves nothing. Whenever the change could be invisible
  to the cache, add `--skip-nx-cache` to the test and build steps, for example
  `pnpm exec nx test api-utils --skip-nx-cache`.
- **A pinned image tag must exist.** When a note pins a Docker image (`FROM node:<version>-<variant>`,
  a Playwright or Postgres image), check that every tag and variant it names has been published,
  for example with `https://hub.docker.com/v2/repositories/library/node/tags/<tag>`, and tell
  agents to check the variant their own Dockerfiles use.
- **Say what a merge redeploys.** A change to a Dockerfile, `package.json` or the lockfile can
  trigger an automatic deploy of every service that watches it, including long-running workers.
  When a note touches those files, add an agent hint that a project with such a worker should
  confirm it is idle (or that an interrupted job is safe) before merging, and should say in its
  report which services the merge restarts.
- **`package.json` and lockfiles are not mirrored by promotion.** A note that changes them must
  spell out each version, script or override change, so a project can apply it by hand.

Already-published notes are not rewritten to follow these rules; they apply to new notes.

## File Naming

Use a stable, date-prefixed slug:

```text
YYYY-MM-DD-short-description.yaml
```

The `id` field inside the file must match the filename without `.yaml`.

## Required Fields

Propagating notes require:

- `id`
- `title`
- `priority`
- `area`
- `type`
- `delivery`
- `intent`
- `why`

Use `delivery: code-patch` when downstream projects should adapt local source files.
Code-patch notes require `affectedPaths`.

Use `delivery: package-release` when the change is shipped by publishing one of Nestled's
upstream-managed packages and downstream projects should update dependencies instead of copying
library source. Package-release notes require `packageReleases`.

Use `delivery: hybrid` when downstream projects need both a dependency update and a
local source adaptation. Hybrid notes require both `affectedPaths` and `packageReleases`.

Published packages managed by the `nestled-dev-template` promotion source:

- `@nestledjs/data-browser` from `libs/data-browser`
- `@nestledjs/shared-components` from `libs/shared-components`
- `@nestledjs/access-control` from `libs/access-control`

Those source paths are relative to `nestled-dev-template`. The public `nestled-template` checkout
and downstream projects intentionally omit these package sources and consume their published npm
versions instead. Keep `packageReleases` in promoted notes so the upgrader can apply that dependency
boundary.

Recommended fields:

- `skipIf`
- `verification`
- `agentHints`

Use `priority: ignore` for a note that records a change that should not propagate
downstream.

## Code Patch Example

```yaml
id: 2026-05-13-auth-session-hardening
title: Auth session hardening
priority: high
area: auth
type: security
delivery: code-patch

intent: >
  Ensure expired sessions are rejected consistently before protected
  data is returned.

why: >
  Some routes checked auth at the web layer, but API resolvers could
  still accept stale sessions.

affectedPaths:
  - apps/api/src/auth/**
  - apps/web/app/routes/**

skipIf:
  - Project has custom auth with documented expiry enforcement.

verification:
  - pnpm lint
  - pnpm test
  - pnpm test:e2e:auth

agentHints:
  - Look for session expiry checks near API resolver auth middleware.
  - If the project uses a custom auth provider, preserve that provider and enforce the same expiry behavior there.
```

## Package Release Example

```yaml
id: 2026-05-13-data-browser-bulk-actions
title: Data browser bulk actions
priority: normal
area: admin
type: feature
delivery: package-release

intent: >
  Make the new admin data browser bulk action UI available to downstream projects by
  upgrading the published data browser package.

why: >
  The implementation lives in the published package, so downstream projects should not
  copy source from libs/data-browser.

packageReleases:
  - name: '@nestledjs/data-browser'
    sourcePath: libs/data-browser
    targetVersion: 1.1.0
    versionRange: ^1.1.0

verification:
  - pnpm install
  - pnpm build:web

agentHints:
  - Update package.json and the lockfile to use the published version.
  - Do not copy files from libs/data-browser into the downstream project.
```

`targetVersion` and `versionRange` may be omitted before a release version exists, but
the upgrader must block package-release notes that do not identify a published target
version at execution time.
