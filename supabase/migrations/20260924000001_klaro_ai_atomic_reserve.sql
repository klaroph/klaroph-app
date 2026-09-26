-- KlaroPH AI v1 security hardening:
-- 1) Atomic generation reservation (daily cap + cooldown) to prevent concurrent bypass
-- 2) Explicit revoke of client write privileges on AI tables

CREATE OR REPLACE FUNCTION public.klaro_ai_try_reserve_generation(
  p_user_id uuid,
  p_daily_limit integer,
  p_cooldown_seconds integer
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
BEGIN
  -- Deny JWT roles authenticated/anon even if EXECUTE were mis-granted.
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

  IF p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    p_daily_limit := 0;
  END IF;

  IF p_cooldown_seconds IS NULL OR p_cooldown_seconds < 0 THEN
    p_cooldown_seconds := 0;
  END IF;

  INSERT INTO public.klaro_ai_usage (user_id, usage_date, generation_count, last_request_at)
  VALUES (p_user_id, v_date, 0, NULL)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT generation_count, last_request_at
  INTO v_count, v_last
  FROM public.klaro_ai_usage
  WHERE user_id = p_user_id AND usage_date = v_date
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
  WHERE user_id = p_user_id AND usage_date = v_date;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', null,
    'generation_count', v_count + 1,
    'retry_after_seconds', null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer) TO service_role;

-- Defense in depth: authenticated/anon clients must not write AI tables even if policies are misconfigured.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.klaro_ai_insights FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.klaro_ai_usage FROM authenticated, anon;

COMMENT ON FUNCTION public.klaro_ai_try_reserve_generation(uuid, integer, integer) IS
  'Atomically reserves one Klaro AI generation under daily cap + cooldown. service_role only.';
