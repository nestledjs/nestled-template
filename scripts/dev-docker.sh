#!/bin/bash
# Single entry point for this repo's dev docker compose stack.
# Passes the repo-root .env to compose so the host-port vars in .env.example actually apply —
# compose otherwise reads .dev/.env, because --project-directory defaults to the compose file's
# directory. Do NOT add --project-directory: the default bind mounts (./tmp/*) are relative to .dev/.
# --env-file is added only when a .env exists, because compose hard-errors on a missing one and
# that would break `pnpm docker:up` on a fresh clone.
# The compose project name comes from `name:` in the compose file — do not pass -p here.
# From a git worktree, the main checkout's .env and data directory are used (scripts/dev-checkout.sh),
# so the worktree drives the same containers with the same config instead of recreating them.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/dev-checkout.sh
source "$ROOT/scripts/dev-checkout.sh"
nestled_dev_checkout "$ROOT"
ARGS=()
[[ -n "$NESTLED_DEV_ENV_FILE" ]] && ARGS+=(--env-file "$NESTLED_DEV_ENV_FILE")
ARGS+=(-f "$ROOT/.dev/docker-compose.yml")
exec docker compose "${ARGS[@]}" "$@"
