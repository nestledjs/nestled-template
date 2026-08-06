#!/bin/bash
# Wrapper script for e2e tests that handles SIGKILL exit properly
# The tests use SIGKILL to prevent hanging, which causes a non-zero exit code
# but if all tests passed, we should still report success

set +e  # Don't exit on error

# Use tee to show output in real-time AND capture it
TMPFILE=$(mktemp)
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:${POSTGRES_TEST_PORT:-5433}/nestled_template_test}"
export DATABASE_URL="$TEST_DATABASE_URL"

TEST_DB_STARTED=false

cleanup() {
  if [[ "$TEST_DB_STARTED" = true ]]; then
    ./scripts/test-db.sh stop >/dev/null 2>&1 || true
  fi
  return 0
}

trap cleanup EXIT

if ! PGPASSWORD=postgres psql -U postgres -h localhost -p "${POSTGRES_TEST_PORT:-5433}" -d nestled_template_test -c "SELECT 1" >/dev/null 2>&1; then
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

if echo "$OUTPUT" | grep -q "✅ Cleanup complete - all tests passed!" && \
   echo "$OUTPUT" | grep -q "Test Files.*passed" && \
   echo "$OUTPUT" | grep -q "Tests.*passed"; then
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
