GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bugs_query_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_epics_query_id() TO authenticated;