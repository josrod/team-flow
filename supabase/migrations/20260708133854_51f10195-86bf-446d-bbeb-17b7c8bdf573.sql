
-- Revoke direct EXECUTE from client roles on SECURITY DEFINER helper functions
-- that are only meant to be invoked internally (triggers / RLS policies).

-- Trigger functions: only executed by the trigger system, never by clients.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_epics_query_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_bugs_query_id() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies; policies are evaluated as the calling
-- role, so authenticated must retain EXECUTE. Revoke from anon and PUBLIC.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
