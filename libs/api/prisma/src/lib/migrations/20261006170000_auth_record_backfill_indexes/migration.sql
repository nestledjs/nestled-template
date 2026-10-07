-- Ordered before the invariant backfill for installations receiving the whole release.
-- Existing installations apply this additive migration without rewriting migration history.
-- Keep this as the only statement: CONCURRENTLY cannot run inside a transaction block.
CREATE INDEX CONCURRENTLY "Email_userId_primary_createdAt_id_idx"
ON "Email" ("userId", "primary", "createdAt", id);
