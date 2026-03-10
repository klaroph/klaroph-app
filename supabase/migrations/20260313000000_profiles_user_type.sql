-- KlaroPH: profiles.user_type for secure internal tester pricing
-- Values: 'user' (default), 'tester'. Only backend/service_role may set tester.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'user';

-- Restrict allowed values
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_user_type_check CHECK (user_type IN ('user', 'tester'));

-- Safety: prevent non–service_role from changing user_type (e.g. client updates)
CREATE OR REPLACE FUNCTION profiles_block_user_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.user_type IS DISTINCT FROM NEW.user_type THEN
    -- Only allow when no user context (e.g. service_role from backend)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'user_type is not updatable by client'
        USING ERRCODE = 'privilege_not_revoked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_user_type_protect ON profiles;
CREATE TRIGGER profiles_user_type_protect
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_block_user_type_change();

COMMENT ON COLUMN profiles.user_type IS 'Internal only: user | tester. Tester gets ₱5 pricing. Set via backend only.';
