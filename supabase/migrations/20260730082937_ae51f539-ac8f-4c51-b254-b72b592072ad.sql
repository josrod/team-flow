DROP VIEW IF EXISTS public.azure_devops_public_config;

CREATE OR REPLACE FUNCTION public.get_public_ado_config()
RETURNS TABLE (
  id uuid,
  server_url text,
  collection text,
  organization text,
  project text,
  team text,
  area_paths text[],
  iteration_paths text[],
  bugs_query_id text,
  epics_query_id text,
  epics_tags text[],
  epics_project text,
  epics_team text,
  epics_area_paths text[],
  epics_iteration_paths text[],
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.server_url, s.collection, s.organization, s.project, s.team,
    s.area_paths, s.iteration_paths, s.bugs_query_id, s.epics_query_id,
    s.epics_tags, s.epics_project, s.epics_team, s.epics_area_paths,
    s.epics_iteration_paths, s.updated_at
  FROM public.azure_devops_settings s
  ORDER BY s.updated_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_public_ado_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_ado_config() TO anon, authenticated;