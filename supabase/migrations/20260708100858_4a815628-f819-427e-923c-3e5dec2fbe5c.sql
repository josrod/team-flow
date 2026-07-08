-- Revoke public EXECUTE on SECURITY DEFINER / trigger helper functions.
-- Trigger functions are invoked by the trigger executor, not by end users.
-- has_role() is called from RLS policy expressions, which run under the row's
-- policy evaluation context and do not require EXECUTE for anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_bugs_query_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_epics_query_id() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_bugs_query_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_epics_query_id() TO service_role;