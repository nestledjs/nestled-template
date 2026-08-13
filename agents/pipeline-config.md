# Pipeline Config — nestled-template

> **⚠️ Deploy-monitoring only. This repo is NOT code-pipeline enabled.**
>
> This file exists so Deploy Fixer can see the repo's Railway deployments. It deliberately declares
> **no** `source_system`, `linear_project_id`, `auto_merge`, or `merge_command`, so the code pipeline
> (intake → plan → execute → auto-merge) does not pick this repo up and cannot merge to it.
>
> Added 2026-08-12. Before this, `nestled-template` had a live Railway project and no
> `pipeline-config.md` at all, which made it invisible to Deploy Fixer *and* to every pipeline pass —
> despite being the canonical clone source that new Nestled sites are created from. A silently broken
> deploy here would propagate outward before anyone noticed.
>
> **Do not add pipeline fields to this file casually.** This is the template every new site is cloned
> from; automated merges here have a wider blast radius than in a normal app repo. If it should
> become pipeline-enabled, that's Justin's explicit call.

## Repo
| Field | Value |
|---|---|
| `repo_name` | `nestled-template` |
| `framework` | `nestled` |
| `github_slug` | `nestledjs/nestled-template` |
| `base_branch` | `develop` |
| `repo_path` | resolve at runtime with `git rev-parse --show-toplevel` — portable across Mac (`~/IdeaProjects`) and Linux (`~/workspaces`) hosts; never hardcode |

## Host — Railway (for Deploy Fixer mapping)
| Field | Value |
|---|---|
| `host` | `railway` |
| `railway_project_name` | `nestled-template` |
| `railway_project_id` | `9cb10a5b-c60e-444c-83a0-f99260a5fd4b` |
| `railway_environment_name` | `production` |
| `railway_environment_id` | `e746a86c-4be8-442c-8b0d-5dc9e4aceac7` |

Git-backed services in this project — Deploy Fixer checks **each** one's latest deployment.
Managed plugins (Postgres, Redis) are not git-backed and are not scanned.

| Service | ID |
|---|---|
| `api` | `11dcacda-3247-4da4-a1cb-a6df31f67e11` |
| `web` | `c11e4dfe-adf8-4aad-9eec-146b805b8b60` |

## Deploy failure handling

⚠️ **This repo has no Linear project**, so Deploy Fixer's normal remediation (open a Linear issue,
branch, fix, auto-merge on green) does not apply.

On a failed deployment here: **diagnose, surface to Justin, and stop.** Do not open a Linear issue
against another repo's project, do not push a fix branch, and do not merge. A broken template deploy
is a propagation risk, not a routine app failure — it wants a human decision about whether new site
clones should be paused until it's resolved.
