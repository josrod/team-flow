-- 1) Remove anonymous read access from internal team data tables.
DROP POLICY IF EXISTS "Anyone can read teams" ON public.teams;
CREATE POLICY "Authenticated users can read teams"
  ON public.teams FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read members" ON public.members;
CREATE POLICY "Authenticated users can read members"
  ON public.members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read absences" ON public.absences;
CREATE POLICY "Authenticated users can read absences"
  ON public.absences FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read handovers" ON public.handovers;
CREATE POLICY "Authenticated users can read handovers"
  ON public.handovers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read work_topics" ON public.work_topics;
CREATE POLICY "Authenticated users can read work_topics"
  ON public.work_topics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read task notes" ON public.task_handover_notes;
CREATE POLICY "Authenticated users can read task notes"
  ON public.task_handover_notes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read epic versions" ON public.epic_versions;
CREATE POLICY "Authenticated users can read epic versions"
  ON public.epic_versions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read epic version assignments" ON public.epic_version_assignments;
CREATE POLICY "Authenticated users can read epic version assignments"
  ON public.epic_version_assignments FOR SELECT TO authenticated USING (true);

-- 2) Revoke the underlying table grants for the anonymous role.
REVOKE ALL ON public.teams FROM anon;
REVOKE ALL ON public.members FROM anon;
REVOKE ALL ON public.absences FROM anon;
REVOKE ALL ON public.handovers FROM anon;
REVOKE ALL ON public.work_topics FROM anon;
REVOKE ALL ON public.task_handover_notes FROM anon;
REVOKE ALL ON public.epic_versions FROM anon;
REVOKE ALL ON public.epic_version_assignments FROM anon;

-- Make sure signed-in users keep the access their policies allow.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handovers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_handover_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_version_assignments TO authenticated;

-- 3) Drop the SECURITY DEFINER helper exposed through the API.
DROP FUNCTION IF EXISTS public.get_public_ado_config();