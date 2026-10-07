-- Ordered before the invariant backfill for installations receiving the whole release.
-- Existing installations apply this additive migration without rewriting migration history.
CREATE INDEX "Email_userId_primary_createdAt_id_idx"
ON "Email" ("userId", "primary", "createdAt", id);

CREATE INDEX "OrganizationMember_organizationId_userId_idx"
ON "OrganizationMember" ("organizationId", "userId");
