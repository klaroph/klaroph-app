-- KlaroPH AI v1: insight cache + daily generation usage.
-- Justified: no existing usage_limits / ai_* / insight-cache tables in the repo.
-- Service role writes after authenticated API check; users may read own rows via RLS.

CREATE TABLE IF NOT EXISTS public.klaro_ai_insights (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period text NOT NULL,
  context_hash text NOT NULL,
  insight_text text NOT NULL,
  source text NOT NULL CHECK (source IN ('gemini', 'fallback')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_klaro_ai_insights_user_updated
  ON public.klaro_ai_insights (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.klaro_ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  generation_count integer NOT NULL DEFAULT 0 CHECK (generation_count >= 0),
  last_request_at timestamptz,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.klaro_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.klaro_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS klaro_ai_insights_select_own ON public.klaro_ai_insights;
CREATE POLICY klaro_ai_insights_select_own ON public.klaro_ai_insights
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS klaro_ai_usage_select_own ON public.klaro_ai_usage;
CREATE POLICY klaro_ai_usage_select_own ON public.klaro_ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Writes go through service role (supabaseAdmin) after the API authenticates the user.
COMMENT ON TABLE public.klaro_ai_insights IS 'Cached Klaro Insight narratives keyed by user + period + context hash.';
COMMENT ON TABLE public.klaro_ai_usage IS 'Per-user daily Klaro AI generation counters for free-tier protection.';
