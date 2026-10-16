#!/bin/bash

# Test Database Management Script
# Usage: ./scripts/test-db.sh [start|stop|reset|logs|migrate|url]

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
TEST_DB_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:${TEST_DB_PORT}/nestled_template_test}"
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

# Prisma's `migrate deploy` has no guard of its own, so `migrate` refuses a URL that is not a
# disposable test database, by the rules the e2e setup applies before it resets, migrates, pushes or
# seeds (apps/api-e2e/src/support/database-guards.ts): a postgres(ql):// URL on this machine, named
# *_test. E2E_ALLOW_NON_DISPOSABLE_DB=1 admits another host or name; a query string or fragment,
# which could send the client elsewhere, is refused either way.
assert_disposable_test_database() {
  local action="$1"
  local pattern='^(postgres|postgresql)://([^@/?#]*@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:[0-9]+)?/([A-Za-z0-9_-]+)$'
  if [[ ! "$TEST_DB_URL" =~ $pattern ]]; then
    echo "❌ Refusing to $action $TEST_DB_DISPLAY_URL: not a plain postgresql:// URL (no query or fragment)." >&2
    exit 1
  fi
  local host="${BASH_REMATCH[3]}" database="${BASH_REMATCH[5]}"
  local lower_database
  lower_database="$(printf '%s' "$database" | tr '[:upper:]' '[:lower:]')"
  if [[ "$host" =~ ^(localhost|127\.0\.0\.1|\[::1\])$ && "$lower_database" == *_test ]]; then
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
  while ! docker exec "$TEST_DB_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do
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
    echo "  url     - Print the resolved test database URL"
    echo ""
    echo "Test DB URL: $TEST_DB_DISPLAY_URL"
    ;;
esac
