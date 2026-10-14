#!/bin/bash
# Sourced by scripts/dev-docker.sh and scripts/test-db.sh. Makes the dev Docker stack worktree-safe.
#
# The compose project name and container names are fixed, so every git worktree of this repo drives
# the same containers. Run from a worktree with the defaults, compose would recreate them with that
# worktree's ./tmp bind mounts (deleted along with the worktree) and, with no .env there, the
# default ports. So from a worktree:
#   - the .env is the worktree's own when it has one, otherwise the main checkout's;
#   - NESTLED_DEV_DATA_DIR, which .dev/docker-compose.yml mounts data from, defaults to the main
#     checkout's .dev/tmp, unless the environment or that .env already sets it.
# A single checkout behaves exactly as before: its own .env, and ./tmp next to the compose file.
#
# nestled_dev_checkout <root> sets NESTLED_MAIN_CHECKOUT and NESTLED_DEV_ENV_FILE (empty when
# neither checkout has a .env) and exports NESTLED_DEV_DATA_DIR when the default applies.

# The main checkout that owns <root>: the parent of the shared git directory when that is a .git
# folder, otherwise <root> itself (outside git, a bare repository, or git missing).
nestled_main_checkout() {
  local root="$1" common
  common="$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || common=""
  if [[ -n "$common" && "$(basename "$common")" == ".git" ]]; then
    (cd "$(dirname "$common")" && pwd -P)
  else
    (cd "$root" && pwd -P)
  fi
}

# A .env line that sets NESTLED_DEV_DATA_DIR to something: an empty or quoted-empty value counts as
# unset, as compose's ${NESTLED_DEV_DATA_DIR:-./tmp} treats it. Keep in step with dev-checkout.mjs.
NESTLED_DEV_DATA_DIR_SET='^[[:space:]]*(export[[:space:]]+)?NESTLED_DEV_DATA_DIR[[:space:]]*=[[:space:]]*([^"'"'"'[:space:]#]|"[^"]|'"'"'[^'"'"'])'

nestled_dev_checkout() {
  local root
  root="$(cd "$1" && pwd -P)"
  NESTLED_MAIN_CHECKOUT="$(nestled_main_checkout "$root")"
  NESTLED_DEV_ENV_FILE=""
  if [[ -f "$root/.env" ]]; then
    NESTLED_DEV_ENV_FILE="$root/.env"
  elif [[ -f "$NESTLED_MAIN_CHECKOUT/.env" ]]; then
    NESTLED_DEV_ENV_FILE="$NESTLED_MAIN_CHECKOUT/.env"
  fi
  if [[ "$NESTLED_MAIN_CHECKOUT" != "$root" && -z "${NESTLED_DEV_DATA_DIR:-}" ]] &&
    ! { [[ -n "$NESTLED_DEV_ENV_FILE" ]] && grep -qE "$NESTLED_DEV_DATA_DIR_SET" "$NESTLED_DEV_ENV_FILE"; }; then
    export NESTLED_DEV_DATA_DIR="$NESTLED_MAIN_CHECKOUT/.dev/tmp"
  fi
  return 0
}
