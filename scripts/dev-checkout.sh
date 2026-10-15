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
  return 0
}

# Reading .env as compose does. Compose (and dotenv) let the LAST assignment of a key win, take a
# quoted value up to its closing quote, and drop an unquoted value's ` # comment`. Keep in step with
# lastAssignment() and definesVariable() in dev-checkout.mjs.

# nestled_env_line <file> <key>: the text after `=` in the last assignment of <key> (an `export `
# prefix and spaces around the key allowed), trimmed; empty when there is none. Lines inside another
# key's multi-line quoted value are not assignments, as compose reads them. A <key> whose own value
# spans lines is refused (status 1, reason on stderr): no script here needs one.
nestled_env_line() {
  local raw status=0
  raw="$(awk -v key="$2" '
    # Whether s holds the closing quote q (a backslash escapes a double quote).
    function closes(s, q,   i, c) {
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (q == "\"" && c == "\\") { i++; continue }
        if (c == q) return 1
      }
      return 0
    }
    open != "" { if (closes($0, open)) open = ""; next }
    match($0, /^[ \t]*(export[ \t]+)?[A-Za-z_][A-Za-z0-9_.-]*[ \t]*=/) {
      name = substr($0, 1, RLENGTH - 1)
      sub(/^[ \t]*(export[ \t]+)?/, "", name)
      sub(/[ \t]+$/, "", name)
      rest = substr($0, RLENGTH + 1)
      sub(/^[ \t]+/, "", rest)
      q = substr(rest, 1, 1)
      opens = (q == "\"" || q == "'"'"'") && !closes(substr(rest, 2), q)
      if (name == key) { value = rest; multiline = opens }
      if (opens) open = q
    }
    END { if (multiline) exit 3; printf "%s", value }
  ' "$1" 2>/dev/null)" || status=$?
  if [[ "$status" -eq 3 ]]; then
    echo "❌ .env gives $2 a quoted value that spans lines; put it on one line." >&2
    return 1
  fi
  printf '%s\n' "${raw%"${raw##*[![:space:]]}"}"
  return 0
}

# nestled_env_ambiguous <key> <raw>: fail, saying why, for an unquoted value that starts with `#`.
# Compose reads `KEY= # note` as the value `# note`; dotenv, which Nx and the API load, reads it as
# empty. No reading is safe, so nothing guesses.
nestled_env_ambiguous() {
  echo "❌ .env sets $1 to an unquoted value that starts with '#' ($2)." >&2
  echo "   docker compose reads that as the value and dotenv as empty. Remove the comment, or quote" >&2
  echo "   the value (\"\" for empty)." >&2
  return 1
}

# nestled_env_sets <file> <key>: whether the .env gives <key> a non-empty value, which is when
# compose's ${KEY:-default} uses it. Status 0 yes, 1 no, 2 ambiguous (reported on stderr).
nestled_env_sets() {
  local raw
  raw="$(nestled_env_line "$1" "$2")" || return 2
  case "$raw" in
    "" | '""'* | "''"*) return 1 ;;
    "#"*)
      nestled_env_ambiguous "$2" "$raw"
      return 2
      ;;
  esac
  return 0
}

# nestled_env_value <file> <key>: the value compose reads for <key>, for a script that uses it as is
# (a port, a folder to delete). Empty when the key is absent. Fails, saying why, for a value this
# cannot read the way compose does: one compose would interpolate (`$` unquoted or in double quotes;
# single quotes are literal), one with backslash escapes in double quotes, and an unquoted value
# that starts with `#`.
nestled_env_value() {
  local key="$2" raw first
  raw="$(nestled_env_line "$1" "$key")" || return 1
  first="${raw:0:1}"
  if [[ "$first" == "'" && "${raw:1}" == *"$first"* ]]; then
    raw="${raw:1}"
    printf '%s\n' "${raw%%"$first"*}"
    return 0
  fi
  if [[ "$first" == '"' && "${raw:1}" == *"$first"* ]]; then
    raw="${raw:1}"
    raw="${raw%%"$first"*}"
    if [[ "$raw" == *"\\"* ]]; then
      echo "❌ .env sets $key to a double-quoted value with a backslash escape; use a plain value." >&2
      return 1
    fi
  elif [[ "$first" == "#" ]]; then
    nestled_env_ambiguous "$key" "$raw"
    return 1
  else
    raw="${raw%%" #"*}"
    raw="${raw%"${raw##*[![:space:]]}"}"
  fi
  if [[ "$raw" == *'$'* ]]; then
    echo "❌ .env sets $key to a value that docker compose interpolates ($raw)." >&2
    echo "   This script cannot resolve \${...} as compose does, so it would act on another value." >&2
    echo "   Write the value out literally (or single-quote it if the \$ is meant literally)." >&2
    return 1
  fi
  printf '%s\n' "$raw"
  return 0
}

nestled_dev_checkout() {
  local root
  root="$(cd "$1" && pwd -P)"
  # An exported-but-empty value would still reach compose and outrank --env-file, so the .env's real
  # data directory would be masked and ${NESTLED_DEV_DATA_DIR:-./tmp} would fall back to this tree.
  [[ -n "${NESTLED_DEV_DATA_DIR:-}" ]] || unset NESTLED_DEV_DATA_DIR
  NESTLED_MAIN_CHECKOUT="$(nestled_main_checkout "$root")"
  NESTLED_DEV_ENV_FILE=""
  if [[ -f "$root/.env" ]]; then
    NESTLED_DEV_ENV_FILE="$root/.env"
  elif [[ -f "$NESTLED_MAIN_CHECKOUT/.env" ]]; then
    NESTLED_DEV_ENV_FILE="$NESTLED_MAIN_CHECKOUT/.env"
  fi
  if [[ "$NESTLED_MAIN_CHECKOUT" == "$root" || -n "${NESTLED_DEV_DATA_DIR:-}" ]]; then
    return 0
  fi
  local sets=1
  if [[ -n "$NESTLED_DEV_ENV_FILE" ]]; then
    if nestled_env_sets "$NESTLED_DEV_ENV_FILE" NESTLED_DEV_DATA_DIR; then sets=0; else sets=$?; fi
  fi
  case "$sets" in
    1) export NESTLED_DEV_DATA_DIR="$NESTLED_MAIN_CHECKOUT/.dev/tmp" ;;
    2) return 1 ;;
  esac
  return 0
}
