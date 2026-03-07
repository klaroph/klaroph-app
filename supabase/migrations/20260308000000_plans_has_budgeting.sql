-- Add has_budgeting to plans for explicit Free vs Pro alignment.
-- Product: Monthly Budgeting — Pro always; Free only first 30 days (time rule in app).
-- This column means "plan includes full budgeting (no time limit)".

ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_budgeting boolean NOT NULL DEFAULT false;

-- Seed: free = false, pro and clarity_premium = true
INSERT INTO plans (name, max_goals, has_simulator, has_scenarios, has_smart_insights, has_export, has_analytics, has_budgeting)
VALUES
  ('free', 2, false, false, false, false, false, false),
  ('pro', 20, true, true, true, true, true, true),
  ('clarity_premium', 20, true, true, true, true, true, true)
ON CONFLICT (name) DO UPDATE SET
  max_goals = EXCLUDED.max_goals,
  has_simulator = EXCLUDED.has_simulator,
  has_scenarios = EXCLUDED.has_scenarios,
  has_smart_insights = EXCLUDED.has_smart_insights,
  has_export = EXCLUDED.has_export,
  has_analytics = EXCLUDED.has_analytics,
  has_budgeting = EXCLUDED.has_budgeting;
