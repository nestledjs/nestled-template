#!/bin/bash
# Runs the API e2e suite against the test database and reports PASSED only when Vitest exited 0, its
# summary counts no failure, and at least one test passed.

set +e  # Don't exit on error

# Use tee to show output in real-time AND capture it
TMPFILE=$(mktemp)
# Resolve the test DB URL the way scripts/test-db.sh does (it reads POSTGRES_TEST_PORT from the
# repo-root .env), so a direct `api-e2e:test` run doesn't probe/migrate the wrong port.
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(./scripts/test-db.sh url)}"
export DATABASE_URL="$TEST_DATABASE_URL"
# prisma.config.ts prefers DIRECT_URL — pin it to the test DB too, or Prisma reaches the dev DB.
export DIRECT_URL="$TEST_DATABASE_URL"
# E2E's own API port so a running dev API can't be attached to; global-setup/test-setup read it.
export E2E_API_PORT="${E2E_API_PORT:-3100}"

# Probe the database with the URL itself — its host, port, credentials and name — through the
# suite's pg runner, so no psql binary is needed. A probe with fixed postgres:postgres credentials
# failed against any other login (CI's test database uses prisma:prisma) and started a container
# the tests never used.
probe_test_database() {
  node -e 'process.stdout.write(JSON.stringify({ url: process.env.TEST_DATABASE_URL, statement: "SELECT 1" }))' |
    node apps/api-e2e/src/support/sql-runner.mjs >/dev/null 2>&1
}

TEST_DB_STARTED=false

cleanup() {
  if [[ "$TEST_DB_STARTED" = true ]]; then
    ./scripts/test-db.sh stop >/dev/null 2>&1 || true
  fi
  return 0
}

trap cleanup EXIT

if ! probe_test_database; then
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

# Read the captured output, without colour codes, so the summary lines can be matched reliably
OUTPUT=$(sed -E 's/\x1b\[[0-9;]*m//g' "$TMPFILE")
rm -f "$TMPFILE"

# Vitest's summary reads e.g. "Test Files  1 failed | 28 passed (29)". Any failed count there means
# the run failed, whatever else was printed.
SUMMARY_HAS_FAILURES=false
if echo "$OUTPUT" | grep -qE '^[[:space:]]*(Test Files|Tests)[[:space:]].*[0-9]+ failed'; then
  SUMMARY_HAS_FAILURES=true
fi

# How many tests passed, from the summary line "Tests  3 failed | 125 passed (128)". A run in which
# no test passed — no test matched, or every test was skipped — proves nothing, so it never reports
# PASSED, whatever the exit code.
PASSED_COUNT=$(echo "$OUTPUT" | grep -E '^[[:space:]]*Tests[[:space:]]' | tail -1 | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
PASSED_COUNT=${PASSED_COUNT:-0}

SEPARATOR="════════════════════════════════════════════════════════════"

if [[ $EXIT_CODE -eq 0 && "$SUMMARY_HAS_FAILURES" == false && "$PASSED_COUNT" -gt 0 ]]; then
  echo ""
  echo "$SEPARATOR"
  echo "✅ E2E Tests PASSED ($PASSED_COUNT tests)"
  echo "$SEPARATOR"
  exit 0
fi

echo ""
echo "$SEPARATOR"
if [[ "$SUMMARY_HAS_FAILURES" == true ]]; then
  echo "❌ E2E Tests FAILED (the summary counts a failure; Vitest exit code: $EXIT_CODE)"
elif [[ "$PASSED_COUNT" -eq 0 ]]; then
  echo "❌ E2E Tests FAILED: no test passed (none ran, or all were skipped; Vitest exit code: $EXIT_CODE)"
else
  echo "❌ E2E Tests FAILED (Vitest exit code: $EXIT_CODE)"
fi
echo "$SEPARATOR"
[[ $EXIT_CODE -ne 0 ]] && exit $EXIT_CODE
exit 1
