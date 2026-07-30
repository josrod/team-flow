ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS proxy_rate_limit_max_requests integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS proxy_rate_limit_window_seconds integer NOT NULL DEFAULT 60;

ALTER TABLE public.azure_devops_settings
  ADD CONSTRAINT azure_devops_settings_rate_limit_max_requests_check
    CHECK (proxy_rate_limit_max_requests BETWEEN 1 AND 10000),
  ADD CONSTRAINT azure_devops_settings_rate_limit_window_seconds_check
    CHECK (proxy_rate_limit_window_seconds BETWEEN 1 AND 3600);

DROP FUNCTION IF EXISTS public.get_public_ado_config();

CREATE FUNCTION public.get_public_ado_config()
 RETURNS TABLE(id uuid, server_url text, collection text, organization text, project text, team text, area_paths text[], iteration_paths text[], bugs_query_id text, epics_query_id text, epics_tags text[], epics_project text, epics_team text, epics_area_paths text[], epics_iteration_paths text[], proxy_rate_limit_max_requests integer, proxy_rate_limit_window_seconds integer, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.server_url, s.collection, s.organization, s.project, s.team,
    s.area_paths, s.iteration_paths, s.bugs_query_id, s.epics_query_id,
    s.epics_tags, s.epics_project, s.epics_team, s.epics_area_paths,
    s.epics_iteration_paths, s.proxy_rate_limit_max_requests,
    s.proxy_rate_limit_window_seconds, s.updated_at
  FROM public.azure_devops_settings s
  ORDER BY s.updated_at DESC
  LIMIT 1
$function$;