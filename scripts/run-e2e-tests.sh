#!/bin/bash

# E2E Test Runner
# Automatically starts test database, runs tests, and cleans up

set -e

echo "🧪 Starting E2E Test Suite"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
  ./scripts/test-db.sh stop 2>/dev/null || true
  return 0
}

# Set up cleanup trap
trap cleanup EXIT

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
  exit 1
fi

# Start test database
echo -e "${BLUE}1. Starting test database...${NC}"
./scripts/test-db.sh start

# Run database migrations
echo -e "${BLUE}2. Running database migrations...${NC}"
# Honor a caller-supplied TEST_DATABASE_URL instead of clobbering it. Otherwise ask test-db.sh,
# which resolved the port from .env when it started the container above — pnpm runs this script
# with a plain shell that never loads .env, so deriving the URL here would pin it to 5433 while
# the container came up on whatever port block this repo claimed.
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(./scripts/test-db.sh url)}"
export DATABASE_URL="$TEST_DATABASE_URL"
# prisma.config.ts prefers DIRECT_URL || DATABASE_URL — pin DIRECT_URL to the test DB too, or a repo
# .env DIRECT_URL wins and `migrate deploy` runs against the dev database (#117). Quoted so a `?schema=`
# query in the URL isn't mangled by pathname expansion.
export DIRECT_URL="$TEST_DATABASE_URL"
pnpm prisma migrate deploy

# Run the tests
echo -e "${BLUE}3. Running E2E tests...${NC}"

# Route through api-e2e:test (the run-tests.sh wrapper), not api-e2e:e2e. The wrapper runs vitest
# with tee'd output and adjusts the SIGKILL exit code, so a failure surfaces the actual Vitest
# assertion details; api-e2e:e2e goes through the Nx executor and can exit with only Nx's failure
# summary. Extra args after `--` reach the wrapper's "$@" and become a vitest file-path filter.
# Option 1: Run specific test file
# set +e so a failing target doesn't abort under `set -e` before we capture its code — otherwise the
# `$?` check below is unreachable on failure and the run reports success (#119).
set +e
if [[ "$1" != "" ]]; then
  echo -e "${YELLOW}Running specific test: $1${NC}"
  pnpm nx run api-e2e:test -- "$1"
# Option 2: Run all tests
else
  echo -e "${YELLOW}Running all E2E tests...${NC}"
  pnpm nx run api-e2e:test
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