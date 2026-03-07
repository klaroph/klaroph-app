-- Auto profile creation trigger: ensure every new auth.users row gets a profiles row.
-- Idempotent: ON CONFLICT DO NOTHING so existing users and duplicate triggers are safe.
-- onboarding_completed defaults to false for new users.
-- Runs after 20250229100000_profiles_onboarding_completed so the column exists.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Create profile if missing (idempotent; does not break existing users or duplicate runs).
  INSERT INTO public.profiles (id, full_name, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  -- Ensure free subscription exists for new user (idempotent).
  SELECT id INTO free_plan_id FROM plans WHERE name = 'free' LIMIT 1;
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (NEW.id, free_plan_id, 'active', now(), now() + interval '1 year')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates public.profiles (and free subscription) on new auth.users insert. Uses ON CONFLICT DO NOTHING for safety.';
