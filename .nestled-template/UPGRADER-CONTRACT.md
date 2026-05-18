# Nestled Upgrader Contract

This repository produces two kinds of downstream changes:

- Template source changes that downstream projects should adapt as local code patches.
- Published library changes that downstream projects should consume by updating npm
  package versions.

The upgrader must read each file in `.nestled-template/upgrade-notes/*.yaml`.

If a note has `priority: ignore`, the upgrader must treat it as a historical or decision record,
not as an actionable downstream update. It may display the note for context, but it must not apply a
code patch, update packages, block migration, or require verification for that note.

For all other notes, use the `delivery` field to choose the propagation method.

## Delivery Modes

### `code-patch`

Use this when the downstream project should adapt files in its own repository.

Required fields:

- `affectedPaths`
- `intent`
- `why`

Upgrader behavior:

- Treat `affectedPaths` as hints, not exact patch instructions.
- Apply or adapt the behavior described by `intent`.
- Respect `skipIf`.
- Run the note's `verification` commands when practical.
- Do not assume downstream files are identical to this template.

### `package-release`

Use this when the implementation lives in a published package owned by this repo.

Published packages:

- `@nestledjs/data-browser` from `libs/data-browser`
- `@nestledjs/shared-components` from `libs/shared-components`

Required fields:

- `packageReleases`
- `intent`
- `why`

Each `packageReleases` entry has:

- `name`: npm package name.
- `sourcePath`: source path in this repo.
- `targetVersion`: exact published version to consume, when known.
- `versionRange`: dependency range downstream projects should use, when known.

Upgrader behavior:

- Update downstream `package.json` dependencies, peer dependencies, or related package
  manager metadata to use `versionRange` when present, otherwise `targetVersion`.
- Update the lockfile with the downstream package manager.
- Do not copy source files from the package's `sourcePath` into the downstream project.
- Block the note if neither `targetVersion` nor `versionRange` identifies a published
  package version.
- Verify the requested version exists in the package registry before applying.
- Run the note's `verification` commands when practical.

### `hybrid`

Use this when downstream projects need both a package update and local code adaptation.

Required fields:

- `affectedPaths`
- `packageReleases`
- `intent`
- `why`

Upgrader behavior:

- Apply the package-release behavior first.
- Then adapt local source using the code-patch behavior.
- Run verification after both steps.

## Authoring Rules

When a change touches only `libs/data-browser` or `libs/shared-components`, prefer
`delivery: package-release`.

When a change touches a published package and also changes template app usage, use
`delivery: hybrid`.

When a change touches other template areas such as `apps/*`, `libs/api/*`, `libs/web-ui`,
`libs/shared/*`, scripts, or infra, prefer `delivery: code-patch`.

`targetVersion` and `versionRange` may be omitted while the release is still pending.
They must be filled in before the upgrader applies the note.
