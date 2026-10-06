-- Email and membership statements already own their row locks when AFTER triggers run.
-- Never wait for a User lock here: explicit application workflows acquire User first.
-- Abort on contention so the complete write can retry without retaining any row locks.
CREATE OR REPLACE FUNCTION "lock_auth_record_owners"(owner_ids text[])
RETURNS void AS $$
BEGIN
  PERFORM id FROM "User" WHERE id = ANY(owner_ids) ORDER BY id FOR NO KEY UPDATE NOWAIT;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Concurrent account maintenance; retry the complete transaction'
    USING ERRCODE = 'serialization_failure';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "sync_email_owner_validation"(owner_id text, invalidate_token boolean)
RETURNS void AS $$
BEGIN
  IF owner_id IS NULL THEN RETURN; END IF;
  PERFORM "lock_auth_record_owners"(ARRAY[owner_id]);
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
  owner_id text;
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
  -- Lock both owners in one deterministic order before recomputing either. Bulk/nested
  -- writes may already own other locks; NOWAIT also prevents cycles across those statements.
  PERFORM "lock_auth_record_owners"(ARRAY[old_owner, new_owner]);
  FOR owner_id IN SELECT DISTINCT id FROM unnest(ARRAY[old_owner, new_owner]) AS owners(id)
                  WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM "sync_email_owner_validation"(owner_id, primary_changed);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "membership_removal_clears_active_organization"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    PERFORM "lock_auth_record_owners"(ARRAY[OLD."userId"]);
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
