#!/bin/bash

# E2E Test Runner
# Starts the repo's test database, runs tests, and cleans up. With a caller-supplied
# TEST_DATABASE_URL it uses that database as is: it neither starts nor stops the repo's own test
# container, and the run fails if the supplied database is unreachable.

set -e

echo "🧪 Starting E2E Test Suite"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# A caller-supplied URL names a database this script does not manage.
MANAGE_TEST_DB=true
if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  MANAGE_TEST_DB=false
fi

# Cleanup function
cleanup() {
  if [[ "$MANAGE_TEST_DB" != true ]]; then
    return 0
  fi
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
  if ! ./scripts/test-db.sh stop 2>/dev/null; then
    echo -e "${RED}⚠️  Could not stop the test database. Stop it with ./scripts/test-db.sh stop.${NC}" >&2
  fi
  return 0
}

# Set up cleanup trap
trap cleanup EXIT

if [[ "$MANAGE_TEST_DB" = true ]]; then
  # Check if Docker is running
  if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
  fi

  # Start test database
  echo -e "${BLUE}1. Starting test database...${NC}"
  ./scripts/test-db.sh start
else
  echo -e "${BLUE}1. Using the supplied TEST_DATABASE_URL; not starting the repo's test database${NC}"
fi

# Configure the database used by the e2e setup
echo -e "${BLUE}2. Configuring test database...${NC}"
# Honor a caller-supplied TEST_DATABASE_URL instead of clobbering it. Otherwise ask test-db.sh,
# which resolved the port from .env when it started the container above — pnpm runs this script
# with a plain shell that never loads .env, so deriving the URL here would pin it to 5433 while
# the container came up on whatever port block this repo claimed.
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(./scripts/test-db.sh url)}"
export DATABASE_URL="$TEST_DATABASE_URL"
# prisma.config.ts prefers DIRECT_URL || DATABASE_URL — pin DIRECT_URL to the test DB too, or a repo
# .env DIRECT_URL wins and `migrate deploy` runs against the dev database. Quoted so a `?schema=`
# query in the URL isn't mangled by pathname expansion.
export DIRECT_URL="$TEST_DATABASE_URL"
# Global setup owns migrations, including recovery for disposable databases created by db push.
# Running migrate deploy here would exit on P3005 before that recovery can run.

# Run the tests
echo -e "${BLUE}3. Running E2E tests...${NC}"

# api-e2e:e2e runs the run-tests.sh wrapper, which tees Vitest's output and reports PASSED only when
# Vitest exited 0, its summary counts no failure and at least one test passed. Extra args after `--`
# reach the wrapper's "$@" and become a Vitest file-path filter. (api-e2e:test is the support suite
# only, so `nx run-many -t test` never starts this e2e run or its database.)
# Option 1: Run specific test file
# set +e so a failing target doesn't abort under `set -e` before we capture its code — otherwise the
# `$?` check below is unreachable on failure and the run reports success.
set +e
if [[ "$1" != "" ]]; then
  echo -e "${YELLOW}Running specific test: $1${NC}"
  pnpm nx run api-e2e:e2e -- "$1"
# Option 2: Run all tests
else
  echo -e "${YELLOW}Running all E2E tests...${NC}"
  pnpm nx run api-e2e:e2e
fi
E2E_EXIT=$?
set -e

# Check test results
if [[ $E2E_EXIT -eq 0 ]]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
else
  echo -e "\n${RED}❌ Some tests failed.${NC}"
  exit "$E2E_EXIT"
fi