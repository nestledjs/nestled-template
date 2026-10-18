#!/bin/bash
# Runs the API e2e suite against the test database and reports PASSED only when Vitest exited 0, its
# summary counts no failure, and at least one test passed.

# Fail on any unexpected error, unset variable or failed pipeline stage. The Vitest run and the
# summary parsing below handle their own non-zero statuses explicitly.
set -euo pipefail

# Use tee to show output in real-time AND capture it
TMPFILE=$(mktemp)
# A caller-supplied URL names a database this script does not manage: if it is unreachable the run
# fails, rather than starting the repo's Compose test database, which would not be at that URL.
SUPPLIED_TEST_DATABASE_URL="${TEST_DATABASE_URL:-}"
# Resolve the test DB URL the way scripts/test-db.sh does (it reads POSTGRES_TEST_PORT from the
# repo-root .env), so a direct `api-e2e:e2e` run doesn't probe/migrate the wrong port.
# Assigned, then exported: `export X="$(cmd)"` returns export's status, so under `set -e` a failing
# `test-db.sh url` would go unnoticed and the run would continue with an empty URL.
TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(./scripts/test-db.sh url)}"
export TEST_DATABASE_URL
export DATABASE_URL="$TEST_DATABASE_URL"
# prisma.config.ts prefers DIRECT_URL — pin it to the test DB too, or Prisma reaches the dev DB.
export DIRECT_URL="$TEST_DATABASE_URL"
# E2E's own API port so a running dev API can't be attached to; global-setup/test-setup read it.
export E2E_API_PORT="${E2E_API_PORT:-3100}"

# Probe the database with the URL itself — its host, port, credentials and name — through the
# suite's pg runner, so no psql binary is needed. A probe with fixed postgres:postgres credentials
# failed against any other login (CI's test database uses prisma:prisma) and started a container
# the tests never used. The runner's error (a refused connection, a failed login, a missing
# database) is kept in PROBE_ERROR so a failure says why.
PROBE_ERROR=""
probe_test_database() {
  local status=0
  PROBE_ERROR="$(
    node -e 'process.stdout.write(JSON.stringify({ url: process.env.TEST_DATABASE_URL, statement: "SELECT 1" }))' |
      node apps/api-e2e/src/support/sql-runner.mjs 2>&1 >/dev/null
  )" || status=$?
  return "$status"
}

# Text for the log with the test database URL and any `scheme://user:password@` user-info removed.
# The runner already leaves the URL out of its errors; this is the second line of defence, since
# these lines reach CI logs.
scrub_credentials() {
  local text="$1"
  text="${text//"$TEST_DATABASE_URL"/<TEST_DATABASE_URL>}"
  printf '%s\n' "$text" | sed -E 's#([A-Za-z][A-Za-z0-9+.-]*://)[^@[:space:]/]+@#\1***@#g'
  return 0
}

# Print the probe's error, indented, or say there was none.
report_probe_error() {
  local detail="${PROBE_ERROR:-(no error output)}"
  echo "   Probe error: $(scrub_credentials "$detail" | sed '2,$s/^/   /')"
  return 0
}

TEST_DB_STARTED=false

cleanup() {
  if [[ "$TEST_DB_STARTED" = true ]] && ! ./scripts/test-db.sh stop >/dev/null 2>&1; then
    # Not fatal for the result, which is already decided, but a test database left running holds
    # its port and its data into the next run.
    echo "" >&2
    echo "⚠️  WARNING: this run started the test database and could not stop it." >&2
    echo "   Stop it with ./scripts/test-db.sh stop before the next run." >&2
  fi
  rm -f "${TMPFILE:-}"
  return 0
}

trap cleanup EXIT

if ! probe_test_database; then
  echo "⚠️  The test database did not answer SELECT 1."
  report_probe_error
  # A server that is up but lacks the database: create it when the URL is a local *_test database
  # (test-db.sh ensure refuses anything else), then probe again.
  ENSURE_OUTPUT=""
  if ENSURE_OUTPUT="$(./scripts/test-db.sh ensure 2>&1)" && probe_test_database; then
    scrub_credentials "$ENSURE_OUTPUT"
  elif [[ -n "$SUPPLIED_TEST_DATABASE_URL" ]]; then
    [[ -z "$ENSURE_OUTPUT" ]] || scrub_credentials "$ENSURE_OUTPUT"
    echo "❌ TEST_DATABASE_URL is set but that database is not accessible"
    report_probe_error
    echo "   Start it, or unset TEST_DATABASE_URL to use the repo's own test database"
    exit 1
  elif ! docker info >/dev/null 2>&1; then
    echo "❌ Test database is not accessible and Docker is not running"
    echo "   Start Docker or set TEST_DATABASE_URL to an accessible test database"
    exit 1
  else
    # start also creates the database the URL names when the container lacks it.
    ./scripts/test-db.sh start
    TEST_DB_STARTED=true
  fi
fi

# Call vitest directly to avoid infinite loop (since NX now calls this script)
# "$@" passes through any extra flags from the caller (e.g. --coverage)
# errexit is off for the run itself: a failing Vitest is a result to report, not a script error.
set +e
npx vitest run --config apps/api-e2e/vitest.config.mts "$@" 2>&1 | tee "$TMPFILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# Read the captured output, without colour codes, so the summary lines can be matched reliably
OUTPUT=$(sed -E 's/\x1b\[[0-9;]*m//g' "$TMPFILE")
rm -f "$TMPFILE"

# Vitest's summary reads e.g. "Test Files  1 failed | 28 passed (29)". Any failed count there means
# the run failed, whatever else was printed.
SUMMARY_HAS_FAILURES=false
# A here-string, not `echo | grep -q`: grep -q stops reading at the first match, and under pipefail
# the writer's SIGPIPE would turn a found failure into "no match".
if grep -qE '^[[:space:]]*(Test Files|Tests)[[:space:]].*[0-9]+ failed' <<<"$OUTPUT"; then
  SUMMARY_HAS_FAILURES=true
fi

# How many tests passed, from the summary line "Tests  3 failed | 125 passed (128)". A run in which
# no test passed — no test matched, or every test was skipped — proves nothing, so it never reports
# PASSED, whatever the exit code.
# grep exits 1 when nothing matches; under pipefail that is a count of zero, not an error.
PASSED_COUNT=$(grep -E '^[[:space:]]*Tests[[:space:]]' <<<"$OUTPUT" | tail -1 | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || true)
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
