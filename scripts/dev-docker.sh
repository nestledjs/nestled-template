#!/bin/bash
# Single entry point for this repo's dev docker compose stack.
# Passes the repo-root .env to compose so the host-port vars in .env.example actually apply —
# compose otherwise reads .dev/.env, because --project-directory defaults to the compose file's
# directory. Do NOT add --project-directory: the bind mounts (./tmp/*) are relative to .dev/.
# --env-file is added only when .env exists, because compose hard-errors on a missing one and
# that would break `pnpm docker:up` on a fresh clone.
# The compose project name comes from `name:` in the compose file — do not pass -p here.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARGS=()
[ -f "$ROOT/.env" ] && ARGS+=(--env-file "$ROOT/.env")
ARGS+=(-f "$ROOT/.dev/docker-compose.yml")
exec docker compose "${ARGS[@]}" "$@"
