-- Any change of "User"."isActive", in either direction and through any path (application code,
-- generated CRUD, nested writes, raw SQL), moves "authGeneration" on, so every token issued before
-- the change stops working, including after the account is reactivated. An update that already
-- moves "authGeneration" itself is left as it is.
CREATE OR REPLACE FUNCTION "user_is_active_bumps_auth_generation"() RETURNS trigger AS $$
BEGIN
  IF NEW."isActive" IS DISTINCT FROM OLD."isActive"
     AND NEW."authGeneration" = OLD."authGeneration" THEN
    NEW."authGeneration" := OLD."authGeneration" + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_isActive_bumps_authGeneration"
BEFORE UPDATE OF "isActive" ON "User"
FOR EACH ROW
EXECUTE FUNCTION "user_is_active_bumps_auth_generation"();
