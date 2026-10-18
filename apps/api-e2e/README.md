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
pnpm test:e2e               # starts the test database container, runs the suite, stops it (with TEST_DATABASE_URL set, uses that database and manages no container)
pnpm nx e2e api-e2e         # runs the suite; starts the container only if no TEST_DATABASE_URL is set and the database is unreachable
pnpm nx e2e api-e2e -- src/auth/auth-generation.spec.ts   # one file
```

`api-e2e:e2e` runs the wrapper, `run-tests.sh`, and is never cached: every green result comes from a
run that just happened. `api-e2e:test` is only the suite's own support tests (`api-e2e:test-support`:
the wrapper, the process cleanup, the SQL runner and the database guards), which need no database, so
`nx run-many -t test` never starts the e2e run or a test database. The wrapper prints every test by name and reports
PASSED, with the number of tests that passed, only when Vitest's summary has no failure and at least
one test passed. A filter that matches nothing, or a run in which every test is skipped, fails.

## How It Works

1. **Wrapper** (`run-tests.sh`): resolves the test database URL and probes it with its own
   credentials. When the probe fails it prints the client's error, with the URL and credentials
   removed, then runs `scripts/test-db.sh ensure`, which creates the database when the server is up
   but lacks it (only a plain `postgresql://` URL on this machine named `*_test`, whatever
   `E2E_ALLOW_NON_DISPOSABLE_DB` says), and probes again. If it is still unreachable it either fails
   (a caller-supplied `TEST_DATABASE_URL`) or starts the repo's test container (no URL supplied),
   whose `start` creates the database the same way. It then runs Vitest and checks the summary.
2. **Global setup** (`src/support/global-setup.ts`):
   - refuses a test database that is not disposable (a `postgresql:` URL on this machine, named
     `*_test`, with no `?schema=`, fragment or destination-override parameter) before anything is
     reset, migrated, pushed or seeded, unless `E2E_ALLOW_NON_DISPOSABLE_DB=1` is set. The wrapper's
     read-only `SELECT 1` probe has already connected by then; nothing writes before this check.
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
- `E2E_ALLOW_NON_DISPOSABLE_DB`: set to `1` only when the test database is disposable but not local,
  not named `*_test` or given a `?schema=` (a CI service container reached by its service name, for
  example). Setup migrates, pushes and seeds it; the from-scratch reset still requires a disposable
  database. It never lets through a URL that could connect somewhere other than it appears to: a
  query parameter that overrides the destination (`?host=`, `?port=`, `?dbname=`...), a fragment,
  or a protocol other than `postgresql:`. A setup that empties the schema on every run gains nothing
  from it and should not offer it. `scripts/test-db.sh migrate` applies the same rule before
  `prisma migrate deploy`, except that it accepts no query string at all.
- `E2E_DATABASE_PROBE`: the client global setup's own SQL (the `SELECT 1` probe and the
  from-scratch reset) runs through. `pg` (default) uses the pg runner; `psql` runs `psql` from PATH,
  for a repo whose lifecycle tests stub psql.

## CI

CI runs `pnpm exec nx run api-e2e:e2e -- --coverage` against PostgreSQL and Redis service
containers, as its own step after the unit tests. `TEST_DATABASE_URL` points at the service database
with its own credentials.

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
- **"Refusing to run e2e setup against ..."**: `TEST_DATABASE_URL` is not a disposable database; the
  message says why. Point it at one, or, when the message allows it, set
  `E2E_ALLOW_NON_DISPOSABLE_DB=1` if it is disposable anyway.
- **"Test database not accessible"**: the "Probe error" line above it says why (a refused
  connection, a failed login, a missing database). Check `TEST_DATABASE_URL`, or start the
  container with `pnpm test:db:start`. A missing local `*_test` database is created by
  `./scripts/test-db.sh ensure`; any other database you create yourself.
- **"no test passed"**: the file filter matched nothing, or every test was skipped.
- **"could not stop it"**: the wrapper started the test database and `scripts/test-db.sh stop`
  failed. Stop it by hand before the next run.
