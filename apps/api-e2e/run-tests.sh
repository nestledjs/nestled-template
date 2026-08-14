#!/bin/bash
# Wrapper script for e2e tests that handles SIGKILL exit properly
# The tests use SIGKILL to prevent hanging, which causes a non-zero exit code
# but if all tests passed, we should still report success

set +e  # Don't exit on error

# Use tee to show output in real-time AND capture it
TMPFILE=$(mktemp)
# Resolve the test DB URL the way scripts/test-db.sh does (it reads POSTGRES_TEST_PORT from the
# repo-root .env), so a direct `api-e2e:test` run doesn't probe/migrate the wrong port (#119).
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(./scripts/test-db.sh url)}"
export DATABASE_URL="$TEST_DATABASE_URL"
# prisma.config.ts prefers DIRECT_URL — pin it to the test DB too, or Prisma reaches the dev DB (#117).
export DIRECT_URL="$TEST_DATABASE_URL"
# E2E's own API port so a running dev API can't be attached to (#118); global-setup/test-setup read it.
export E2E_API_PORT="${E2E_API_PORT:-3100}"

# Probe the DB at the URL's own host/port/name — the URL is the single source of truth. Probing
# POSTGRES_TEST_PORT instead would mismatch a caller-supplied TEST_DATABASE_URL on a non-default port
# (e.g. a block-specific 5473), producing a false "not accessible" or a redundant container start.
_db="${TEST_DATABASE_URL#*://}"                     # strip scheme://
_db="${_db##*@}"                                     # strip any user:pass@
_db_hostport="${_db%%/*}"                            # host[:port]
_db_name="${_db#*/}"; _db_name="${_db_name%%[?]*}"   # dbname (drop ?query if present)
_db_host="${_db_hostport%%:*}"
_db_port="${_db_hostport##*:}"
[ "$_db_port" = "$_db_hostport" ] && _db_port=5432   # no explicit port in the URL

TEST_DB_STARTED=false

cleanup() {
  if [[ "$TEST_DB_STARTED" = true ]]; then
    ./scripts/test-db.sh stop >/dev/null 2>&1 || true
  fi
  return 0
}

trap cleanup EXIT

if ! PGPASSWORD=postgres psql -U postgres -h "$_db_host" -p "$_db_port" -d "$_db_name" -c "SELECT 1" >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "❌ Test database is not accessible and Docker is not running"
    echo "   Start Docker or set TEST_DATABASE_URL to an accessible test database"
    rm -f "$TMPFILE"
    exit 1
  fi

  ./scripts/test-db.sh start
  TEST_DB_STARTED=true
fi

# Call vitest directly to avoid infinite loop (since NX now calls this script)
# "$@" passes through any extra flags from the caller (e.g. --coverage)
npx vitest run --config apps/api-e2e/vitest.config.mts "$@" 2>&1 | tee "$TMPFILE"
EXIT_CODE=${PIPESTATUS[0]}

# Read the captured output
OUTPUT=$(cat "$TMPFILE")
rm -f "$TMPFILE"

# Check if tests actually passed by looking for success indicators
SEPARATOR="════════════════════════════════════════════════════════════"

if [[ $EXIT_CODE -eq 0 ]]; then
  # Vitest exited cleanly — the tests passed. Trust the exit code first: a legitimate pass can exit 0
  # without the custom "Cleanup complete" console line reaching the captured stream, and requiring
  # that marker here printed a false failure banner even though the tests passed.
  echo ""
  echo "$SEPARATOR"
  echo "✅ E2E Tests PASSED"
  echo "$SEPARATOR"
  exit 0
elif echo "$OUTPUT" | grep -q "✅ Cleanup complete - all tests passed!" && \
   echo "$OUTPUT" | grep -q "Test Files.*passed" && \
   echo "$OUTPUT" | grep -q "Tests.*passed"; then
  # Non-zero exit but the run completed with all tests passing: the intentional SIGKILL-to-prevent-
  # hanging case. The marker fallback is retained only for this.
  echo ""
  echo "$SEPARATOR"
  echo "✅ E2E Tests PASSED (exit code adjusted from $EXIT_CODE to 0)"
  echo "   Process was force-killed to prevent hanging - this is expected"
  echo "$SEPARATOR"
  exit 0
else
  echo ""
  echo "$SEPARATOR"
  echo "❌ E2E Tests FAILED (exit code: $EXIT_CODE)"
  echo "$SEPARATOR"
  exit $EXIT_CODE
fi
