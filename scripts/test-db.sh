#!/bin/bash

# Test Database Management Script
# Usage: ./scripts/test-db.sh [start|stop|reset|logs]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE="$SCRIPT_DIR/dev-docker.sh"

# Read a single key from the repo-root .env. Deliberately NOT `source` — that would execute the
# file as shell. Returns empty (never non-zero) when the file or the key is absent, so `set -e`
# does not kill the script on a fresh clone that has no .env yet.
#
# MUST STAY IN STEP with readEnvValue() in scripts/doctor.ts — the two parse the same file, and a
# disagreement means the doctor blesses a .env this script then misreads. Same rules as there:
# strip quotes only when they wrap the WHOLE value (keeping it verbatim), otherwise drop a
# dotenv-style inline ` # comment` and trim. A blanket quote-strip would also eat quotes from
# inside a value, and leaving the comment in produced URLs like `localhost:5443 # block 1/db`.
read_env() {
  [ -f "$ROOT/.env" ] || return 0

  local key="$1"
  local raw
  raw="$(grep -m1 "^$key=" "$ROOT/.env" | cut -d= -f2-)"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"

  local first="${raw:0:1}" last="${raw: -1}"
  if [ ${#raw} -ge 2 ] && [ "$first" = "$last" ] && { [ "$first" = '"' ] || [ "$first" = "'" ]; }; then
    printf '%s\n' "${raw:1:${#raw}-2}"
    return 0
  fi

  case "$raw" in
    *" #"*) raw="${raw%%" #"*}" ;;
  esac
  printf '%s\n' "${raw%"${raw##*[![:space:]]}"}"
}

# An exported var wins over .env, which wins over the default. Keeping the port and the URL
# derived from the same source is what stops a moved POSTGRES_TEST_PORT from silently pointing
# the tests at another repo's database (see the port block in .env.example).
TEST_DB_PORT="${POSTGRES_TEST_PORT:-$(read_env POSTGRES_TEST_PORT)}"
TEST_DB_PORT="${TEST_DB_PORT:-5433}"
TEST_DB_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:${TEST_DB_PORT}/nestled_template_test}"
# The resolved URL is the single source of truth for the port we report. When a caller supplies
# TEST_DATABASE_URL (e.g. a block-specific port), TEST_DB_PORT still holds the .env/default value, so
# echoing it would claim "ready on port 5433" while actually using the URL's port. Read the port back
# out of the URL for display; fall back to TEST_DB_PORT if the URL carries no explicit port.
TEST_DB_DISPLAY_PORT="$(printf '%s' "$TEST_DB_URL" | sed -nE 's#^[^/]+://[^/]+:([0-9]+)/.*#\1#p')"
TEST_DB_DISPLAY_PORT="${TEST_DB_DISPLAY_PORT:-$TEST_DB_PORT}"
TEST_DB_CONTAINER="nestled-template_postgres_test"

case "$1" in
  "start")
    echo "🚀 Starting test database..."
    "$COMPOSE" --profile testing up -d postgres-test
    
    echo "⏳ Waiting for test database to be ready..."
    timeout=30
    while ! docker exec "$TEST_DB_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do
      sleep 1
      timeout=$((timeout - 1))
      if [[ $timeout -eq 0 ]]; then
        echo "❌ Test database failed to start within 30 seconds"
        exit 1
      fi
    done
    
    echo "✅ Test database is ready on port $TEST_DB_DISPLAY_PORT"
    echo "📄 Connection string: $TEST_DB_URL"
    ;;
    
  "stop")
    echo "🛑 Stopping test database..."
    "$COMPOSE" stop postgres-test
    echo "✅ Test database stopped"
    ;;
    
  "reset")
    echo "🔄 Resetting test database..."
    "$COMPOSE" --profile testing down postgres-test
    "$COMPOSE" --profile testing up -d postgres-test
    
    echo "⏳ Waiting for test database to be ready..."
    timeout=30
    while ! docker exec "$TEST_DB_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do
      sleep 1
      timeout=$((timeout - 1))
      if [[ $timeout -eq 0 ]]; then
        echo "❌ Test database failed to start within 30 seconds"
        exit 1
      fi
    done
    
    echo "✅ Test database reset complete"
    ;;
    
  "logs")
    echo "📋 Test database logs:"
    "$COMPOSE" logs postgres-test
    ;;
    
  "migrate")
    echo "🔄 Running Prisma migrations on test database..."
    export DATABASE_URL=$TEST_DB_URL
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
    echo "Test DB URL: $TEST_DB_URL"
    ;;
esac
