#!/bin/bash

# Test Database Management Script
# Usage: ./scripts/test-db.sh [start|stop|reset|logs|migrate|ensure|verify|url]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE="$SCRIPT_DIR/dev-docker.sh"
# The .env and data directory dev-docker.sh uses: from a git worktree, the main checkout's.
# shellcheck source=scripts/dev-checkout.sh
source "$SCRIPT_DIR/dev-checkout.sh"
nestled_dev_checkout "$ROOT"

# Read a single key from the repo-root .env, as compose reads it (see nestled_env_value in
# dev-checkout.sh: the last assignment wins, a quoted value is kept, an unquoted ` # comment` is
# dropped). Deliberately NOT `source`: that would execute the file as shell. Empty when the file or
# the key is absent, so a fresh clone with no .env works. Exits, saying why, on a value compose
# would read differently (interpolation, or an unquoted value starting with `#`): a port or a data
# folder this script acts on must be the one compose uses.
read_env() {
  local key="$1"
  [[ -n "$NESTLED_DEV_ENV_FILE" ]] || return 0
  nestled_env_value "$NESTLED_DEV_ENV_FILE" "$key" || exit 1
}

# An exported var wins over .env, which wins over the default. Keeping the port and the URL
# derived from the same source is what stops a moved POSTGRES_TEST_PORT from silently pointing
# the tests at another repo's database (see the port block in .env.example).
TEST_DB_PORT="${POSTGRES_TEST_PORT:-}"
[[ -n "$TEST_DB_PORT" ]] || TEST_DB_PORT="$(read_env POSTGRES_TEST_PORT)" || exit 1
TEST_DB_PORT="${TEST_DB_PORT:-5433}"
# The URL of the repo's own test database: the container `start` brings up on POSTGRES_TEST_PORT.
# Any other URL names a database you chose, on a server you vouch for.
TEST_DB_OWN_URL="postgresql://postgres:postgres@localhost:${TEST_DB_PORT}/nestled_template_test"
TEST_DB_URL="${TEST_DATABASE_URL:-$TEST_DB_OWN_URL}"
# CI providers set CI to `true` or `1`; `false`, `0` and an empty value mean it is not CI.
in_ci() {
  case "$(printf '%s' "${CI:-}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" in
    '' | 0 | false) return 1 ;;
    *) return 0 ;;
  esac
}

# The development Postgres's host port: POSTGRES_PORT from the environment, else .env, else the port
# compose defaults to. Empty in CI when neither sets it (CI has no development Postgres), which skips
# the development-server check below.
DEV_DB_PORT="$(printf '%s' "${POSTGRES_PORT:-}" | tr -d '[:space:]')"
[[ -n "$DEV_DB_PORT" ]] || DEV_DB_PORT="$(read_env POSTGRES_PORT)" || exit 1
DEV_DB_PORT_SOURCE="POSTGRES_PORT"
if [[ -z "$DEV_DB_PORT" ]] && ! in_ci; then
  DEV_DB_PORT=5432
  DEV_DB_PORT_SOURCE="POSTGRES_PORT is unset; set it if yours listens elsewhere"
fi
# The resolved URL is the single source of truth for the port we report. When a caller supplies
# TEST_DATABASE_URL (e.g. a block-specific port), TEST_DB_PORT still holds the .env/default value, so
# echoing it would claim "ready on port 5433" while actually using the URL's port. Read the port back
# out of the URL for display; fall back to TEST_DB_PORT if the URL carries no explicit port.
TEST_DB_DISPLAY_PORT="$(printf '%s' "$TEST_DB_URL" | sed -nE 's#^[^/]+://[^/]+:([0-9]+)/.*#\1#p')"
TEST_DB_DISPLAY_PORT="${TEST_DB_DISPLAY_PORT:-$TEST_DB_PORT}"
# The URL for messages, reduced to scheme, host, port and database: this output reaches terminals and
# CI logs, and a connection URI can carry credentials in the user-info and in query parameters
# (password, sslpassword, passfile ...), so both are dropped rather than masked field by field.
# `url` below still prints the real URL, for the callers that connect with it.
# Fails closed: only parts that validate as a host, a port and a database name are shown; any other
# value gets a fixed placeholder, so nothing from an unexpected value is ever echoed.
TEST_DB_DISPLAY_URL="<unrecognised TEST_DATABASE_URL>"
TEST_DB_DISPLAY_PATTERN='^(postgres|postgresql)://([^@/?#]*@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:[0-9]+)?/([A-Za-z0-9_-]+)([?#].*)?$'
if [[ "$TEST_DB_URL" =~ $TEST_DB_DISPLAY_PATTERN ]]; then
  TEST_DB_DISPLAY_URL="${BASH_REMATCH[1]}://${BASH_REMATCH[3]}${BASH_REMATCH[4]}/${BASH_REMATCH[5]}"
fi
TEST_DB_CONTAINER="nestled-template_postgres_test"
# Bind mount backing postgres-test (see the `volumes:` entry in .dev/docker-compose.yml). Compose
# `down` removes named volumes only with -v, and never touches a bind mount — so recreating the
# container alone does NOT clear the data and `reset` has to delete this explicitly. Resolved as
# compose resolves it: NESTLED_DEV_DATA_DIR from the environment or .env (relative to .dev/), else
# .dev/tmp.
DEV_DATA_DIR="${NESTLED_DEV_DATA_DIR:-}"
[[ -n "$DEV_DATA_DIR" ]] || DEV_DATA_DIR="$(read_env NESTLED_DEV_DATA_DIR)" || exit 1
DEV_DATA_DIR="${DEV_DATA_DIR:-./tmp}"
[[ "$DEV_DATA_DIR" == /* ]] || DEV_DATA_DIR="$ROOT/.dev/${DEV_DATA_DIR#./}"
TEST_DB_DATA_DIR="$DEV_DATA_DIR/postgres-test"

# A plain URL: scheme, optional user-info, host, optional port and a database name, nothing after.
TEST_DB_PLAIN_URL_PATTERN='^(postgres|postgresql)://([^@/?#]*@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:[0-9]+)?/([A-Za-z0-9_-]+)$'

# Whether TEST_DB_URL names a local test database: a plain postgres(ql):// URL on this
# machine, named *_test. `migrate` accepts it (and, with E2E_ALLOW_NON_DISPOSABLE_DB=1, more); `ensure`
# creates nothing else, whatever E2E_ALLOW_NON_DISPOSABLE_DB says.
is_local_test_database() {
  [[ "$TEST_DB_URL" =~ $TEST_DB_PLAIN_URL_PATTERN ]] || return 1
  local host="${BASH_REMATCH[3]}" database="${BASH_REMATCH[5]}"
  local lower_database
  lower_database="$(printf '%s' "$database" | tr '[:upper:]' '[:lower:]')"
  if [[ "$host" =~ ^(localhost|127\.0\.0\.1|\[::1\])$ && "$lower_database" == *_test ]]; then
    return 0
  fi
  return 1
}

# Whether TEST_DB_URL is on this machine's development Postgres (DEV_DB_PORT). A
# test database there sits beside the development data, in a server `reset` never clears, and
# `ensure` would create it inside that server. Nothing here acts on such a URL, whatever its name and
# whatever E2E_ALLOW_NON_DISPOSABLE_DB says (the rule database-guards.ts applies in the e2e setup).
on_development_server() {
  [[ -n "$DEV_DB_PORT" ]] || return 1
  [[ "$TEST_DB_URL" =~ $TEST_DB_PLAIN_URL_PATTERN ]] || return 1
  local host="${BASH_REMATCH[3]}" port="${BASH_REMATCH[4]#:}"
  [[ "$host" =~ ^(localhost|127\.0\.0\.1|\[::1\])$ ]] || return 1
  [[ "${port:-5432}" == "$DEV_DB_PORT" ]]
}

# A liveness check is not an identity check: pg_isready and `SELECT 1` say something answers on the
# port, never that it is this repo's server. For the repo's own URL, the server must be the repo's
# own test container, publishing that port. Without a reachable Docker there is no container to
# compare with, and the check is skipped; a URL of your own is yours to vouch for.
own_test_container_problem() {
  [[ "$TEST_DB_URL" == "$TEST_DB_OWN_URL" ]] || return 0
  docker info >/dev/null 2>&1 || return 0
  if docker port "$TEST_DB_CONTAINER" 5432/tcp 2>/dev/null | grep -qE ":${TEST_DB_PORT}\$"; then
    return 0
  fi
  echo "this repo's test container ($TEST_DB_CONTAINER) is not running on port $TEST_DB_PORT, so" \
    "whatever answers there is another server (very likely another repo's Postgres)"
  return 0
}

# Prisma's `migrate deploy` has no guard of its own, so `migrate` refuses a URL that is not a
# disposable test database, by the rules the e2e setup applies before it resets, migrates, pushes or
# seeds (apps/api-e2e/src/support/database-guards.ts): a postgres(ql):// URL on this machine, named
# *_test, not on the development server. E2E_ALLOW_NON_DISPOSABLE_DB=1 admits another host or name;
# a query string or fragment, which could send the client elsewhere, and a URL on the development
# server are refused either way.
refuse_development_server() {
  local action="$1"
  on_development_server || return 0
  echo "❌ Refusing to $action $TEST_DB_DISPLAY_URL: it is on port $DEV_DB_PORT, the development" >&2
  echo "   Postgres ($DEV_DB_PORT_SOURCE). Point TEST_DATABASE_URL at the test server (POSTGRES_TEST_PORT)." >&2
  echo "   E2E_ALLOW_NON_DISPOSABLE_DB does not apply: a database on the development server is never" >&2
  echo "   a disposable test database, whatever it is named." >&2
  exit 1
}

assert_disposable_test_database() {
  local action="$1"
  if [[ ! "$TEST_DB_URL" =~ $TEST_DB_PLAIN_URL_PATTERN ]]; then
    echo "❌ Refusing to $action $TEST_DB_DISPLAY_URL: not a plain postgresql:// URL (no query or fragment)." >&2
    exit 1
  fi
  refuse_development_server "$action"
  if is_local_test_database; then
    return 0
  fi
  if [[ "${E2E_ALLOW_NON_DISPOSABLE_DB:-}" == "1" ]]; then
    echo "⚠️  E2E_ALLOW_NON_DISPOSABLE_DB=1: running $action on $TEST_DB_DISPLAY_URL, which is not a local *_test database."
    return 0
  fi
  echo "❌ Refusing to $action $TEST_DB_DISPLAY_URL: a test database must be on this machine (localhost," >&2
  echo "   127.0.0.1 or [::1]) and named *_test. Point TEST_DATABASE_URL at one, or set" >&2
  echo "   E2E_ALLOW_NON_DISPOSABLE_DB=1 if this one is disposable under another host or name." >&2
  exit 1
}

# Create the test database when the server is up but does not have it: a fresh checkout or worktree
# whose TEST_DATABASE_URL names a database the container was not initialised with. It only creates,
# never drops or alters, and only a local *_test database (test-database.mjs checks the same rule
# again before it connects). The URL reaches node through the environment, never its command line.
ensure_test_database() {
  if ! is_local_test_database; then
    echo "❌ Refusing to create $TEST_DB_DISPLAY_URL: only a plain postgresql:// URL on this machine" >&2
    echo "   (localhost, 127.0.0.1 or [::1]) named *_test is created. E2E_ALLOW_NON_DISPOSABLE_DB does" >&2
    echo "   not apply; create any other database yourself." >&2
    return 1
  fi
  if on_development_server; then
    echo "❌ Refusing to create $TEST_DB_DISPLAY_URL: it is on port $DEV_DB_PORT, the development Postgres" >&2
    echo "   ($DEV_DB_PORT_SOURCE), so it would be created beside the development data. Point" >&2
    echo "   TEST_DATABASE_URL at the test server (POSTGRES_TEST_PORT), or create it yourself." >&2
    return 1
  fi
  local problem
  problem="$(own_test_container_problem)"
  if [[ -n "$problem" ]]; then
    echo "❌ Refusing to create $TEST_DB_DISPLAY_URL: $problem." >&2
    echo "   Start this repo's test database (./scripts/test-db.sh start), or move POSTGRES_TEST_PORT" >&2
    echo "   (and TEST_DATABASE_URL with it) to a free port." >&2
    return 1
  fi
  TEST_DATABASE_URL="$TEST_DB_URL" node "$SCRIPT_DIR/test-database.mjs" ensure || return 1
  return 0
}

# After start or reset: the container creates only its own POSTGRES_DB, so make sure the database the
# URL names exists too. A URL that is not a local *_test database is left alone, and a failure is a
# warning: the container is up, and the run that needs the database reports why it cannot reach it.
ensure_test_database_after_start() {
  if ! is_local_test_database; then
    echo "ℹ️  Not checking that $TEST_DB_DISPLAY_URL exists: only a local *_test database is created."
    return 0
  fi
  if ! ensure_test_database; then
    echo "⚠️  The test database is running, but $TEST_DB_DISPLAY_URL could not be checked or created." >&2
  fi
  return 0
}

# Delete the test database's data folder. Postgres makes it 0700 and owned by the container's
# postgres user; on rootful Linux Docker that user is not you, so a plain rm fails. Then the folder
# is emptied from inside a throwaway container of the image the test database ran (given as $1),
# which runs as root, and the empty folder, which you can remove, is removed here.
clear_test_data() {
  local image="$1"
  rm -rf "${TEST_DB_DATA_DIR:?}" 2>/dev/null || true
  [[ -e "$TEST_DB_DATA_DIR" ]] || return 0
  if [[ -z "$image" ]]; then
    echo "❌ Could not delete $TEST_DB_DATA_DIR (it belongs to the container's postgres user)." >&2
    echo "   Delete it with: sudo rm -rf '$TEST_DB_DATA_DIR'" >&2
    echo "   then run: ./scripts/test-db.sh start" >&2
    exit 1
  fi
  echo "   Not removable by $(id -un); clearing it through a throwaway $image container"
  docker run --rm -v "$TEST_DB_DATA_DIR:/target" --entrypoint sh "$image" \
    -c 'find /target -mindepth 1 -delete'
  # Best effort: compose may have created the parent as root, so the emptied folder itself can stay.
  # Postgres initializes an existing empty data directory.
  rm -rf "${TEST_DB_DATA_DIR:?}" 2>/dev/null || true
}

wait_for_db() {
  echo "⏳ Waiting for test database to be ready..."
  local timeout=30
  # Over TCP: the image's temporary init server answers on the socket only, then shuts down.
  while ! docker exec "$TEST_DB_CONTAINER" pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1; do
    sleep 1
    timeout=$((timeout - 1))
    if [[ $timeout -eq 0 ]]; then
      echo "❌ Test database failed to start within 30 seconds"
      exit 1
    fi
  done
}

COMMAND="${1:-}"
case "$COMMAND" in
  "start")
    echo "🚀 Starting test database..."
    "$COMPOSE" --profile testing up -d postgres-test

    wait_for_db
    ensure_test_database_after_start

    echo "✅ Test database is ready on port $TEST_DB_DISPLAY_PORT"
    echo "📄 Connection string: $TEST_DB_DISPLAY_URL"
    ;;

  "stop")
    echo "🛑 Stopping test database..."
    "$COMPOSE" stop postgres-test
    echo "✅ Test database stopped"
    ;;

  "reset")
    echo "🔄 Resetting test database (this destroys all test data)..."
    # The image to clear a container-owned data folder with, read before `down` removes the container.
    TEST_DB_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$TEST_DB_CONTAINER" 2>/dev/null || true)"
    "$COMPOSE" --profile testing down postgres-test
    # The bind mount outlives the container — without this, "reset" only recreates the
    # container and every row survives, which is the opposite of what the command promises.
    CLEARED=""
    if [[ -d "$TEST_DB_DATA_DIR" ]]; then
      echo "🗑️  Clearing $TEST_DB_DATA_DIR"
      clear_test_data "$TEST_DB_IMAGE"
      CLEARED=1
    else
      echo "⚠️  No data directory at $TEST_DB_DATA_DIR, so nothing was deleted. If the test database"
      echo "   keeps its data somewhere else, this reset did not clear it."
    fi
    "$COMPOSE" --profile testing up -d postgres-test

    wait_for_db
    ensure_test_database_after_start

    if [[ -n "$CLEARED" ]]; then
      echo "✅ Test database reset complete"
    else
      echo "✅ Test database recreated; no data directory was found to clear"
    fi
    ;;

  "logs")
    echo "📋 Test database logs:"
    "$COMPOSE" logs postgres-test
    ;;

  "migrate")
    assert_disposable_test_database migrate
    echo "🔄 Running Prisma migrations on test database..."
    export DATABASE_URL="$TEST_DB_URL"
    export DIRECT_URL="$TEST_DB_URL"   # prisma.config.ts prefers DIRECT_URL; pin it (quoted for ?schema=)
    pnpm prisma migrate deploy
    echo "✅ Test database migrations complete"
    ;;

  "ensure")
    ensure_test_database || exit 1
    ;;

  "verify")
    # Before a run: the database the URL names is the one this repo should test against. Not on the
    # development server (whatever E2E_ALLOW_NON_DISPOSABLE_DB says), and, for the repo's own URL,
    # served by the repo's own test container.
    refuse_development_server test
    VERIFY_PROBLEM="$(own_test_container_problem)"
    if [[ -n "$VERIFY_PROBLEM" ]]; then
      echo "❌ Not testing against $TEST_DB_DISPLAY_URL: $VERIFY_PROBLEM." >&2
      echo "   Stop that server or move POSTGRES_TEST_PORT (and TEST_DATABASE_URL with it) to a free" >&2
      echo "   port, then run ./scripts/test-db.sh start." >&2
      exit 1
    fi
    ;;

  "url")
    # The one place that resolves the test-database URL. Callers that are NOT launched through Nx
    # (pnpm runs a script with a plain shell, which never loads .env) must ask for it here rather
    # than re-deriving it, or they end up on 5433 while this script starts the container on the
    # port .env actually asked for.
    echo "$TEST_DB_URL"
    ;;

  *)
    echo "Test Database Management"
    echo ""
    echo "Usage: ./scripts/test-db.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start   - Start the test database container"
    echo "  stop    - Stop the test database container"
    echo "  reset   - Reset the test database (destroys data)"
    echo "  logs    - Show test database logs"
    echo "  migrate - Run Prisma migrations on test database"
    echo "  ensure  - Create the test database if the server does not have it (local *_test only)"
    echo "  verify  - Check the URL is not the development server, and is served by this repo's container"
    echo "  url     - Print the resolved test database URL"
    echo ""
    echo "Test DB URL: $TEST_DB_DISPLAY_URL"
    ;;
esac
