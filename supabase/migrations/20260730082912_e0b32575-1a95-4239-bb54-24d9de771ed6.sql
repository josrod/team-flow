-- Public (anonymous) read access for shared team data
DROP POLICY IF EXISTS "Authenticated can read teams" ON public.teams;
CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.teams TO anon;

DROP POLICY IF EXISTS "Authenticated can read members" ON public.members;
CREATE POLICY "Anyone can read members" ON public.members FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.members TO anon;

DROP POLICY IF EXISTS "Authenticated can read absences" ON public.absences;
CREATE POLICY "Anyone can read absences" ON public.absences FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.absences TO anon;

DROP POLICY IF EXISTS "Authenticated can read handovers" ON public.handovers;
CREATE POLICY "Anyone can read handovers" ON public.handovers FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.handovers TO anon;

DROP POLICY IF EXISTS "Authenticated can read work_topics" ON public.work_topics;
CREATE POLICY "Anyone can read work_topics" ON public.work_topics FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.work_topics TO anon;

DROP POLICY IF EXISTS "Authenticated can read task notes" ON public.task_handover_notes;
CREATE POLICY "Anyone can read task notes" ON public.task_handover_notes FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.task_handover_notes TO anon;

-- Non-sensitive Azure DevOps connection config, readable by everyone.
-- Never exposes pat_encrypted / pat_iv.
CREATE OR REPLACE VIEW public.azure_devops_public_config
WITH (security_invoker = off) AS
SELECT
  id,
  server_url,
  collection,
  organization,
  project,
  team,
  area_paths,
  iteration_paths,
  bugs_query_id,
  epics_query_id,
  epics_tags,
  epics_project,
  epics_team,
  epics_area_paths,
  epics_iteration_paths,
  updated_at
FROM public.azure_devops_settings;

GRANT SELECT ON public.azure_devops_public_config TO anon, authenticated;