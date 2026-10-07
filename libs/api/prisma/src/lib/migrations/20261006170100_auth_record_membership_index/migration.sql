-- Keep this as the only statement so Prisma migrate deploy can build it concurrently.
CREATE INDEX CONCURRENTLY "OrganizationMember_organizationId_userId_idx"
ON "OrganizationMember" ("organizationId", "userId");
