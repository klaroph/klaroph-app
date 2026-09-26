-- Ask Klaro dialogue state: server-written resolution of each assistant turn
-- (intent / entity / period / sort / limit, or a pending clarification).
-- Written only via supabaseAdmin; authenticated/anon INSERT/UPDATE remain revoked.
ALTER TABLE public.klaro_ai_messages
  ADD COLUMN IF NOT EXISTS resolved_state jsonb NULL;
