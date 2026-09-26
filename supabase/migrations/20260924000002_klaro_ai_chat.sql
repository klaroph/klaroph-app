-- Ask Klaro V1: conversations, messages, feature-scoped usage reservation

-- 1) Scope usage by feature (insight | chat) without breaking existing insight rows
ALTER TABLE public.klaro_ai_usage
  ADD COLUMN IF NOT EXISTS feature text NOT NULL DEFAULT 'insight';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'klaro_ai_usage_feature_check'
  ) THEN
    ALTER TABLE public.klaro_ai_usage
      ADD CONSTRAINT klaro_ai_usage_feature_check
      CHECK (feature IN ('insight', 'chat'));
  END IF;
END $$;

ALTER TABLE public.klaro_ai_usage DROP CONSTRAINT IF EXISTS klaro_ai_usage_pkey;
ALTER TABLE public.klaro_ai_usage
  ADD PRIMARY KEY (user_id, usage_date, feature);

-- 2) Conversations
CREATE TABLE IF NOT EXISTS public.klaro_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klaro_ai_conversations_user_updated
  ON public.klaro_ai_conversations (user_id, updated_at DESC);

ALTER TABLE public.klaro_ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS klaro_ai_conversations_select_own ON public.klaro_ai_conversations;
CREATE POLICY klaro_ai_conversations_select_own ON public.klaro_ai_conversations
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.klaro_ai_conversations FROM authenticated, anon;

-- 3) Messages
CREATE TABLE IF NOT EXISTS public.klaro_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.klaro_ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  source text CHECK (source IS NULL OR source IN ('gemini', 'fallback')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_klaro_ai_messages_conversation_created
  ON public.klaro_ai_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_klaro_ai_messages_user_created
  ON public.klaro_ai_messages (user_id, created_at);

ALTER TABLE public.klaro_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS klaro_ai_messages_select_own ON public.klaro_ai_messages;
CREATE POLICY klaro_ai_messages_select_own ON public.klaro_ai_messages
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.klaro_ai_messages FROM authenticated, anon;

-- 4) Feature-aware atomic reserve (replaces 3-arg overload)
DROP FUNCTION IF EXISTS public.klaro_ai_try_reserve_generation(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.klaro_ai_try_reserve_generation(
  p_user_id uuid,
  p_daily_limit integer,
  p_cooldown_seconds integer,
  p_feature text DEFAULT 'insight'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (timezone('utc', now()))::date;
  v_now timestamptz := timezone('utc', now());
  v_count integer;
  v_last timestamptz;
  v_retry integer;
  v_feature text;
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_user',
      'generation_count', 0,
      'retry_after_seconds', null
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_user',
      'generation_count', 0,
      'retry_after_seconds', null
    );
  END IF;

  v_feature := lower(coalesce(nullif(trim(p_feature), ''), 'insight'));
  IF v_feature NOT IN ('insight', 'chat') THEN
    v_feature := 'insight';
  END IF;

  IF p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    p_daily_limit := 0;
  END IF;

  IF p_cooldown_seconds IS NULL OR p_cooldown_seconds < 0 THEN
    p_cooldown_seconds := 0;
  END IF;

  INSERT INTO public.klaro_ai_usage (user_id, usage_date, feature, generation_count, last_request_at)
  VALUES (p_user_id, v_date, v_feature, 0, NULL)
  ON CONFLICT (user_id, usage_date, feature) DO NOTHING;

  SELECT generation_count, last_request_at
  INTO v_count, v_last
  FROM public.klaro_ai_usage
  WHERE user_id = p_user_id AND usage_date = v_date AND feature = v_feature
  FOR UPDATE;

  v_count := COALESCE(v_count, 0);

  IF v_last IS NOT NULL AND v_last > v_now - make_interval(secs => p_cooldown_seconds) THEN
    v_retry := CEIL(EXTRACT(EPOCH FROM (v_last + make_interval(secs => p_cooldown_seconds) - v_now)))::integer;
    IF v_retry < 1 THEN
      v_retry := 1;
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'cooldown',
      'generation_count', v_count,
      'retry_after_seconds', v_retry
    );
  END IF;

  IF v_count >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_cap',
      'generation_count', v_count,
      'retry_after_seconds', null
    );
  END IF;

  UPDATE public.klaro_ai_usage
  SET
    generation_count = v_count + 1,
    last_request_at = v_now
  WHERE user_id = p_user_id AND usage_date = v_date AND feature = v_feature;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', null,
    'generation_count', v_count + 1,
    'retry_after_seconds', null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer, text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer, text) TO service_role;

COMMENT ON TABLE public.klaro_ai_conversations IS 'Ask Klaro conversation threads keyed by user.';
COMMENT ON TABLE public.klaro_ai_messages IS 'Ask Klaro messages; server writes only via service role.';
COMMENT ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer, text) IS
  'Atomically reserves one Klaro AI generation (insight or chat) under daily cap + cooldown. service_role only.';
