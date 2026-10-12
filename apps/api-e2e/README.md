# API E2E Tests

End-to-end tests for the Nestled Template API. They start the API against a disposable test
database and exercise it over HTTP.

## Prerequisites

- Docker, for the test database container, or a PostgreSQL test database you point
  `TEST_DATABASE_URL` at. No `psql` binary is needed: the suite talks to PostgreSQL through the `pg`
  client.
- Redis, as for the API itself.

## Running E2E Tests

```bash
pnpm test:e2e               # starts the test database container, runs the suite, stops it
pnpm nx e2e api-e2e         # runs the suite; starts the container only if the database is unreachable
pnpm nx e2e api-e2e -- src/auth/auth-generation.spec.ts   # one file
```

`api-e2e:e2e` and `api-e2e:test` run the same wrapper, `run-tests.sh`, and are never cached: every
green result comes from a run that just happened. The wrapper prints every test by name and reports
PASSED, with the number of tests that passed, only when Vitest's summary has no failure and at least
one test passed. A filter that matches nothing, or a run in which every test is skipped, fails.

## How It Works

1. **Wrapper** (`run-tests.sh`): resolves the test database URL, probes it with its own
   credentials, starts the test container if it is unreachable, runs Vitest and checks the summary.
2. **Global setup** (`src/support/global-setup.ts`):
   - applies migrations with `prisma migrate deploy`. A local test database built by `db push` alone
     has no migration history; it is emptied and migrated from scratch.
   - runs `prisma db push` and the seed
   - starts the API with `nx serve api` on `E2E_API_PORT`, and refuses to run against an API it did
     not start unless `E2E_ALLOW_EXISTING_API=1` is set
3. **Tests** run against that API with axios. `src/support/test-db.ts` runs SQL against the test
   database for setup and assertions.
4. **Teardown** stops the API process tree it started: its process group on Linux and macOS, the
   launcher and its descendants (`taskkill /T`) on Windows. Cancellation (Ctrl+C) and an exit
   before teardown stop it the same way.

### Environment Variables

- `TEST_DATABASE_URL`: the test database. Unset, it is what `scripts/test-db.sh url` resolves from
  `POSTGRES_TEST_PORT` in the repo-root `.env` (default port 5433). The runners, global setup and
  `test-db.ts` all use that same answer.
- `E2E_API_PORT`: the port the e2e API listens on (default `3100`), kept apart from the dev `PORT`.
- `HOST`: the API host (default `localhost`).
- `E2E_ALLOW_EXISTING_API`: set to `1` only when you started an API on `E2E_API_PORT` against the
  test database yourself.

## CI

CI runs `pnpm test:coverage`, which includes `api-e2e:test`, against PostgreSQL and Redis service
containers. `TEST_DATABASE_URL` points at the service database with its own credentials.

## Test Structure

```
src/
├── api/           # API endpoint tests
├── auth/          # Authentication tests
├── security/      # Security and permissions tests
└── support/       # Setup, teardown, helpers and the wrapper's own tests
```

## Troubleshooting

- **"Refusing to run e2e against an API this suite did not start"**: something already listens on
  `E2E_API_PORT`. Stop it or choose another port.
- **"Test database not accessible"**: check `TEST_DATABASE_URL`, or start the container with
  `pnpm test:db:start`.
- **"no test passed"**: the file filter matched nothing, or every test was skipped.
