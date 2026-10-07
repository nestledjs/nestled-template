# Authentication-record migration rollout

This release contains a pair of historical invariant migrations and an additive index preparation.
Preserve the historical migration files and their checksums on installations that have applied them.

If either invariant migration is pending, use a write-maintenance window. A normal rolling API
deployment leaves the old API serving traffic during pre-deploy migrations. The first migration
installs blocking owner locks, and the second replaces them with sorted, nonblocking locks. Concurrent
account-first and email-first writes can deadlock between those steps. The old API also lacks the
new generated-write retries and explicit membership lock ordering.

1. Build and verify the release before the maintenance window.
2. Pause all API and background writers to the authentication tables and drain their in-flight work.
   Keep writers paused through migration and API replacement; pausing only the deploy process is
   insufficient. Use the installation's established maintenance mechanism.
3. Run `pnpm prisma:deploy` against the intended database. Apply the complete pending migration set,
   including `20261006170000_auth_record_backfill_indexes`,
   `20261006180000_auth_record_invariants`, and `20261006230000_auth_record_lock_contention`.
4. Require successful migration status and verify the final owner-lock implementation:

   ```sql
   SELECT pg_get_functiondef('lock_auth_record_owners(text[])'::regprocedure);
   ```

   It must lock accounts in ID order using `FOR NO KEY UPDATE NOWAIT` and convert lock contention
   into SQLSTATE `40001`. Do not resume writes with only the first invariant migration applied.

5. Start the matching API with generators 3.4.1, full-transaction conflict retries, and the explicit
   membership lock correction. Verify its health check, then resume writers.

If migration or startup fails, keep the maintenance window in place while resolving the failure.
Do not mark an unapplied migration as applied or change an existing migration's contents to bypass it.

The index preparation sorts before the invariant backfill for installations receiving the whole
release. Its Email index supports the per-user primary-address lookup in `createdAt, id` order;
the membership index supports context validation and organization membership lookup. Both are
declared in the Prisma schema so `db push` does not remove them. Installations that have already
applied both invariant migrations only need this additive preparation migration; the two historical
migrations are not rerun.
