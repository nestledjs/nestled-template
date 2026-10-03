# API E2E Tests

End-to-end tests for the Nestled Template API.

## Prerequisites

Before running E2E tests locally, you need:

1. **PostgreSQL database** running locally (e.g., via Docker)
2. **TEST_DATABASE_URL** environment variable set (or use default in `.env`)

The API server will be started automatically by the test setup.

## Running E2E Tests

Simply run:

```bash
pnpm nx test api-e2e
```

The test setup will:

1. Check if PostgreSQL test database is accessible
2. Sync the database schema
3. Seed required data
4. Start the API server if not already running
5. Run tests
6. Stop the API server if tests started it

## How It Works

### Test Setup Flow

1. **Global Setup** (`src/support/global-setup.ts`):
   - Checks if database is accessible
   - Syncs database schema with `prisma db push`
   - Seeds the database with required data
   - Waits for API server to be ready on port 3000

2. **Test Execution**:
   - Tests run against the live API server
   - Uses axios to make HTTP requests
   - Tests are isolated using database transactions or cleanup

3. **Global Teardown** (`src/support/global-teardown.ts`):
   - Cleans up and forces process exit
   - Ensures test process doesn't hang

### Environment Variables

- `TEST_DATABASE_URL` - Database URL for tests (default: `postgresql://postgres:postgres@localhost:5433/nestled_template_test`)
- `HOST` - API host (default: `localhost`)
- `PORT` - API port (default: `3000`)
- `SKIP_API_CHECK` - Skip E2E tests entirely (set to `'true'` to skip)

## CI/CD

E2E tests run automatically in CI with:

- PostgreSQL 15 service container
- Test database pre-configured with credentials `prisma:prisma`
- API server automatically started by the test setup
- Database schema synced and seeded before tests

The CI workflow:

1. Starts PostgreSQL service on port 5432
2. Sets `TEST_DATABASE_URL` environment variable
3. Runs affected tests (including E2E)
4. E2E setup automatically starts API server with test database
5. Tests run against the temporary API server
6. Cleanup stops the API server after tests complete

## Test Structure

```
src/
├── api/           # API endpoint tests
├── auth/          # Authentication tests
├── security/      # Security and permissions tests
└── support/       # Test helpers and setup
    ├── factories/ # Test data factories
    ├── global-setup.ts
    ├── global-teardown.ts
    └── test-setup.ts
```

## Writing Tests

Example test:

```typescript
import { describe, it, expect } from 'vitest'
import axios from 'axios'

describe('My Feature', () => {
  it('should work correctly', async () => {
    const response = await axios.get('/api/my-endpoint')

    expect(response.status).toBe(200)
    expect(response.data).toMatchObject({
      // expected data
    })
  })
})
```

## Troubleshooting

### Tests hang after completion

This should be fixed by the global teardown which forces process exit. If tests still hang:

1. Check if any database connections are not being closed
2. Check if any timers/intervals are not being cleared
3. Increase the timeout in `global-teardown.ts`

### Database connection errors

Make sure PostgreSQL is running:

```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS with Homebrew)
brew services start postgresql
```

### API not found errors

The tests will automatically start the API server if it's not running. If you see connection errors:

1. Check that port 3000 is not in use by another process
2. Check API server logs in test output for startup errors
3. Verify `TEST_DATABASE_URL` is correct
