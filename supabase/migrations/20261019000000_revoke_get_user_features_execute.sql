-- get_user_features(uuid) is not called by the app. It still requires
-- current_period_end > now(), ignores subscriptions.is_lifetime, and was
-- executable by signed-in users. Revoke client execution. service_role keeps
-- the EXECUTE grant from earlier migrations.
--
-- Do not db push. Before merge, apply on the linked database:
--   supabase db query -f supabase/migrations/20261019000000_revoke_get_user_features_execute.sql
--   supabase migration repair --status applied 20261019000000

REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM authenticated;
