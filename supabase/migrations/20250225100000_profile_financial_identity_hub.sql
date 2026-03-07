-- Financial Identity Hub: expand profiles with gamification and clarity system
-- Profile completion and clarity level are computed by backend functions.

-- 1) New columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_income_range text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_goal_category text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS financial_stage text
  CHECK (financial_stage IS NULL OR financial_stage IN ('starter', 'stabilizing', 'building', 'scaling'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS savings_confidence int
  CHECK (savings_confidence IS NULL OR (savings_confidence >= 1 AND savings_confidence <= 5));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS risk_comfort text
  CHECK (risk_comfort IS NULL OR risk_comfort IN ('low', 'medium', 'high'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS motivation_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dream_statement text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completion_percentage int DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clarity_level int NOT NULL DEFAULT 1
  CHECK (clarity_level >= 1 AND clarity_level <= 5);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_days int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges_json jsonb NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Trigger to set updated_at on profile update
CREATE OR REPLACE FUNCTION profiles_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_set_updated_at();

-- 2) Profile completion: nickname, income range, primary goal category, savings confidence, dream statement (5 × 20% = 100%)
CREATE OR REPLACE FUNCTION get_profile_completion_percentage(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p profiles%ROWTYPE;
  n int := 0;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_user_id LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF trim(COALESCE(p.nickname, '')) <> '' THEN n := n + 20; END IF;
  IF trim(COALESCE(p.monthly_income_range, '')) <> '' THEN n := n + 20; END IF;
  IF trim(COALESCE(p.primary_goal_category, '')) <> '' THEN n := n + 20; END IF;
  IF p.savings_confidence IS NOT NULL THEN n := n + 20; END IF;
  IF trim(COALESCE(p.dream_statement, '')) <> '' THEN n := n + 20; END IF;
  RETURN LEAST(100, n);
END;
$$;

-- 3) Clarity level: 1 default, 2 = 1 goal, 3 = 100% profile, 4 = 30-day streak, 5 = 3 goals + consistency (7-day streak)
CREATE OR REPLACE FUNCTION get_clarity_level(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  goal_count int;
  completion int;
  streak int;
  level int := 1;
BEGIN
  SELECT COUNT(*) INTO goal_count FROM goals WHERE user_id = p_user_id;
  SELECT get_profile_completion_percentage(p_user_id) INTO completion;
  SELECT COALESCE((SELECT streak_days FROM profiles WHERE id = p_user_id), 0) INTO streak;

  IF goal_count >= 3 AND streak >= 7 THEN
    level := 5;
  ELSIF streak >= 30 THEN
    level := 4;
  ELSIF completion >= 100 THEN
    level := 3;
  ELSIF goal_count >= 1 THEN
    level := 2;
  END IF;

  RETURN level;
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_completion_percentage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_completion_percentage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_clarity_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_clarity_level(uuid) TO service_role;
