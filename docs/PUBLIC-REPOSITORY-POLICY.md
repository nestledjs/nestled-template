# Public Repository Policy

Every nestledjs repository is public: code, docs, upgrade notes, issues, pull requests, comments,
commit messages and Actions logs. Nestled is used by operators we don't know, on installations we must
never identify. This policy applies to maintainers, contributors and agents alike.

## The rule

A stranger reading anything in these repositories must not be able to learn:

- that a particular organization, client or site runs Nestled, or
- that a particular installation has, or had, a particular weakness.

So never name a downstream project, client, organization or site, never link a private repository,
and never describe an unfixed vulnerability. Describe defects in template terms: "on release
2026.10.1, `register()` mints a token without checking the primary address", not where it was found.
"Found in the field" is fine.

## Where things go

| What | Where |
|---|---|
| Template bugs and requests | Issues on nestled-dev-template, against a template release, with a reproduction on a fresh clone where possible. `nestled-template` doesn't take issues. |
| Package, upgrader, forms and website problems | Issues on that repository |
| Security problems | [Private vulnerability reporting](https://github.com/nestledjs/nestled-dev-template/security/advisories/new) (or the affected package repository's), never an issue |
| Installation-specific detail: which site, which client, local workarounds, ledgers, run logs | The operator's own private repository or notes, never here |

Maintainers and agents can file issues without the issue forms, and don't need to supply a
reproduction. The content rule still applies. `nestled-upgrader report-upstream` drafts a
template-relative issue from an operator's setup and refuses drafts that would identify it.

## Upgrade notes

Notes in `.nestled-updates/upgrade-notes/` are published through the update feed. Write them like a
changelog: the defect, its impact, and the template-relative fix. Leave out where it was found. For a
security fix, the note describes the change. The details go in the advisory, and only after the fix
ships.

## Security fixes (embargo)

1. A report arrives through private vulnerability reporting, or a maintainer opens a draft advisory.
2. The fix is developed in the advisory's private fork, not in a public branch or PR.
3. The fix merges and ships through the update feed, with a generic upgrade note.
4. Downstream installations upgrade. Maintainers decide how long to wait before publishing,
   based on severity and on how quickly operators can be expected to update.
5. The advisory is published. It describes the problem, the affected releases and the fix, with no
   reporter or installation details.

## Enforcement

- The `public-content-guard` workflow fails a pull request, or labels an issue `needs-redaction`, when
  its text matches the organization's private term list. It never prints what matched.
- `nestled-upgrader feed-publish` refuses to publish a note that identifies one of the operator's
  projects.
- If something identifying is published anyway, edit it out and tell a maintainer. Edited text keeps
  its revision history, and only an owner can delete that.
