-- Email identity changes require fresh verification. Preserve a freshly issued change-email
-- token, but never carry an existing token or verification state to another address or owner.
CREATE OR REPLACE FUNCTION "email_identity_requires_verification"() RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    NEW.verified := false;
    IF NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
      NEW."primary" := false;
      NEW."verifyToken" := NULL;
      NEW."verifyExpires" := NULL;
    ELSIF NEW."verifyToken" IS NOT DISTINCT FROM OLD."verifyToken" THEN
      NEW."verifyToken" := NULL;
      NEW."verifyExpires" := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Email_identity_requires_verification" ON "Email";
CREATE TRIGGER "Email_identity_requires_verification"
BEFORE UPDATE ON "Email"
FOR EACH ROW EXECUTE FUNCTION "email_identity_requires_verification"();

CREATE OR REPLACE FUNCTION "sync_email_owner_validation"(owner_id text, invalidate_token boolean)
RETURNS void AS $$
BEGIN
  IF owner_id IS NULL THEN RETURN; END IF;
  -- Serialize recomputation before reading the remaining addresses. The separate statement
  -- observes prior committed email changes after waiting for a concurrent owner's lock.
  PERFORM id FROM "User" WHERE id = owner_id FOR UPDATE;
  UPDATE "User" SET
    "emailValidated" = COALESCE((
      SELECT verified FROM "Email" WHERE "userId" = owner_id AND "primary"
      ORDER BY "createdAt", id LIMIT 1
    ), false),
    "validateEmailToken" = CASE WHEN invalidate_token THEN NULL ELSE "validateEmailToken" END,
    "validateEmailTokenExpires" = CASE WHEN invalidate_token THEN NULL ELSE "validateEmailTokenExpires" END
  WHERE id = owner_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "email_owner_validation_follows_primary"() RETURNS trigger AS $$
DECLARE
  old_owner text;
  new_owner text;
  primary_changed boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_owner := OLD."userId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_owner := NEW."userId"; END IF;
  IF TG_OP = 'INSERT' THEN
    primary_changed := NEW."primary";
  ELSIF TG_OP = 'DELETE' THEN
    primary_changed := OLD."primary";
  ELSIF TG_OP = 'UPDATE' THEN
    primary_changed := (OLD."primary" OR NEW."primary") AND (
      NEW.email IS DISTINCT FROM OLD.email OR NEW."userId" IS DISTINCT FROM OLD."userId"
      OR NEW."primary" IS DISTINCT FROM OLD."primary"
    );
  END IF;
  PERFORM "sync_email_owner_validation"(old_owner, primary_changed);
  IF new_owner IS DISTINCT FROM old_owner THEN
    PERFORM "sync_email_owner_validation"(new_owner, primary_changed);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Email_owner_validation_follows_primary" ON "Email";
CREATE TRIGGER "Email_owner_validation_follows_primary"
AFTER INSERT OR UPDATE OR DELETE ON "Email"
FOR EACH ROW EXECUTE FUNCTION "email_owner_validation_follows_primary"();

-- Clear a removed membership's context regardless of whether the write comes from the
-- membership API, generic admin CRUD, a relation reassignment, or a database maintenance job.
CREATE OR REPLACE FUNCTION "membership_removal_clears_active_organization"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    UPDATE "User" SET "activeOrganizationId" = NULL
    WHERE id = OLD."userId" AND "activeOrganizationId" = OLD."organizationId"
      AND NOT EXISTS (
        SELECT 1 FROM "OrganizationMember"
        WHERE "userId" = OLD."userId" AND "organizationId" = OLD."organizationId"
      );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "OrganizationMember_clear_active_context" ON "OrganizationMember";
CREATE TRIGGER "OrganizationMember_clear_active_context"
AFTER UPDATE OR DELETE ON "OrganizationMember"
FOR EACH ROW EXECUTE FUNCTION "membership_removal_clears_active_organization"();

-- Repair derived state left by earlier generic writes; do not alter verification evidence.
UPDATE "User" u SET "emailValidated" = COALESCE((
  SELECT e.verified FROM "Email" e WHERE e."userId" = u.id AND e."primary"
  ORDER BY e."createdAt", e.id LIMIT 1
), false);
UPDATE "User" u SET "activeOrganizationId" = NULL
WHERE u."activeOrganizationId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "OrganizationMember" m
  WHERE m."userId" = u.id AND m."organizationId" = u."activeOrganizationId"
);
