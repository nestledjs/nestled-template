-- A revoked session stays revoked, and a session's expiry can only be brought forward, by any path
-- (application code, generated CRUD, raw SQL). Revoking a session or shortening its expiry is still
-- allowed. Nothing in the application makes a session valid again or extends it; a new sign-in
-- creates a new session.
CREATE OR REPLACE FUNCTION "user_session_revocation_is_final"() RETURNS trigger AS $$
BEGIN
  IF OLD."isValid" = false AND NEW."isValid" IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A revoked session cannot be made valid again' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."expiresAt" IS NOT NULL
     AND (NEW."expiresAt" IS NULL OR NEW."expiresAt" > OLD."expiresAt") THEN
    RAISE EXCEPTION 'A session''s expiry cannot be extended' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserSession_revocation_is_final"
BEFORE UPDATE OF "isValid", "expiresAt" ON "UserSession"
FOR EACH ROW
EXECUTE FUNCTION "user_session_revocation_is_final"();
