#!/bin/bash
# Wrapper script for e2e tests that handles SIGKILL exit properly
# The tests use SIGKILL to prevent hanging, which causes a non-zero exit code
# but if all tests passed, we should still report success

set +e  # Don't exit on error

# Use tee to show output in real-time AND capture it
TMPFILE=$(mktemp)
# Call vitest directly to avoid infinite loop (since NX now calls this script)
npx vitest run --config apps/api-e2e/vitest.config.ts 2>&1 | tee "$TMPFILE"
EXIT_CODE=${PIPESTATUS[0]}

# Read the captured output
OUTPUT=$(cat "$TMPFILE")
rm -f "$TMPFILE"

# Check if tests actually passed by looking for success indicators
if echo "$OUTPUT" | grep -q "✅ Cleanup complete - all tests passed!" && \
   echo "$OUTPUT" | grep -q "Test Files.*passed" && \
   echo "$OUTPUT" | grep -q "Tests.*passed"; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "✅ E2E Tests PASSED (exit code adjusted from $EXIT_CODE to 0)"
  echo "   Process was force-killed to prevent hanging - this is expected"
  echo "════════════════════════════════════════════════════════════"
  exit 0
else
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "❌ E2E Tests FAILED (exit code: $EXIT_CODE)"
  echo "════════════════════════════════════════════════════════════"
  exit $EXIT_CODE
fi
