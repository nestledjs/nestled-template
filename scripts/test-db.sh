#!/bin/bash

# Test Database Management Script
# Usage: ./scripts/test-db.sh [start|stop|reset|logs]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE="$SCRIPT_DIR/dev-docker.sh"
# The .env and data directory dev-docker.sh uses: from a git worktree, the main checkout's.
# shellcheck source=scripts/dev-checkout.sh
source "$SCRIPT_DIR/dev-checkout.sh"
nestled_dev_checkout "$ROOT"

# Read a single key from the repo-root .env. Deliberately NOT `source` — that would execute the
# file as shell. Returns empty (never non-zero) when the file or the key is absent, so `set -e`
# does not kill the script on a fresh clone that has no .env yet.
#
# MUST STAY IN STEP with readEnvValue() in scripts/doctor.ts — the two parse the same file, and a
# disagreement means the doctor blesses a .env this script then misreads. Same rules as there:
# a quoted value is kept verbatim up to its closing quote (a trailing ` # comment` after it is
# dropped), otherwise drop a dotenv-style inline ` # comment` and trim. A blanket quote-strip would also eat quotes from
# inside a value, and leaving the comment in produced URLs like `localhost:5443 # block 1/db`.
read_env() {
  [[ -n "$NESTLED_DEV_ENV_FILE" ]] || return 0

  local key="$1"
  local raw
  # An optional `export ` prefix and spaces around the key are accepted, as dotenv and compose do.
  raw="$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?$key[[:space:]]*=" "$NESTLED_DEV_ENV_FILE" | cut -d= -f2-)"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"

  # A quoted value runs to its closing quote and is kept verbatim (a `#` inside it included);
  # anything after the closing quote, such as a ` # comment`, is dropped, as dotenv and compose do.
  local first="${raw:0:1}"
  if [[ ( "$first" == '"' || "$first" == "'" ) && "${raw:1}" == *"$first"* ]]; then
    local quoted="${raw:1}"
    printf '%s\n' "${quoted%%"$first"*}"
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
# The URL for messages: its password replaced, since this output reaches terminals and CI logs.
# `url` below still prints the real URL, for the callers that connect with it.
TEST_DB_DISPLAY_URL="$(printf '%s' "$TEST_DB_URL" | sed -E 's#^([^:/]+://[^:/@]*):[^/]*@#\1:****@#')"
TEST_DB_CONTAINER="nestled-template_postgres_test"
# Bind mount backing postgres-test (see the `volumes:` entry in .dev/docker-compose.yml). Compose
# `down` removes named volumes only with -v, and never touches a bind mount — so recreating the
# container alone does NOT clear the data and `reset` has to delete this explicitly. Resolved as
# compose resolves it: NESTLED_DEV_DATA_DIR from the environment or .env (relative to .dev/), else
# .dev/tmp.
DEV_DATA_DIR="${NESTLED_DEV_DATA_DIR:-$(read_env NESTLED_DEV_DATA_DIR)}"
DEV_DATA_DIR="${DEV_DATA_DIR:-./tmp}"
[[ "$DEV_DATA_DIR" == /* ]] || DEV_DATA_DIR="$ROOT/.dev/$DEV_DATA_DIR"
TEST_DB_DATA_DIR="$DEV_DATA_DIR/postgres-test"

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

case "$1" in
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
    "$COMPOSE" --profile testing down postgres-test
    # The bind mount outlives the container — without this, "reset" only recreates the
    # container and every row survives, which is the opposite of what the command promises.
    if [[ -n "$TEST_DB_DATA_DIR" && -d "$TEST_DB_DATA_DIR" ]]; then
      echo "🗑️  Clearing $TEST_DB_DATA_DIR"
      rm -rf "${TEST_DB_DATA_DIR:?}"
    fi
    "$COMPOSE" --profile testing up -d postgres-test

    wait_for_db

    echo "✅ Test database reset complete"
    ;;
    
  "logs")
    echo "📋 Test database logs:"
    "$COMPOSE" logs postgres-test
    ;;
    
  "migrate")
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
