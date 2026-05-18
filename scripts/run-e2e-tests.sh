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
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/nestled_template_test"
export DATABASE_URL=$TEST_DATABASE_URL
pnpm prisma migrate deploy

# Run the tests
echo -e "${BLUE}3. Running E2E tests...${NC}"

# Option 1: Run specific test file
if [[ "$1" != "" ]]; then
  echo -e "${YELLOW}Running specific test: $1${NC}"
  pnpm nx run api-e2e:e2e --testPathPattern="$1"
# Option 2: Run all tests  
else
  echo -e "${YELLOW}Running all E2E tests...${NC}"
  pnpm nx run api-e2e:e2e
fi

# Check test results
if [[ $? -eq 0 ]]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
else
  echo -e "\n${RED}❌ Some tests failed.${NC}"
  exit 1
fi