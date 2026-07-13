
DROP POLICY IF EXISTS "Anyone can read absences" ON public.absences;
CREATE POLICY "Authenticated can read absences" ON public.absences FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.absences FROM anon;

DROP POLICY IF EXISTS "Anyone can read handovers" ON public.handovers;
CREATE POLICY "Authenticated can read handovers" ON public.handovers FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.handovers FROM anon;

DROP POLICY IF EXISTS "Anyone can read task notes" ON public.task_handover_notes;
CREATE POLICY "Authenticated can read task notes" ON public.task_handover_notes FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.task_handover_notes FROM anon;

DROP POLICY IF EXISTS "Anyone can read members" ON public.members;
CREATE POLICY "Authenticated can read members" ON public.members FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.members FROM anon;

DROP POLICY IF EXISTS "Anyone can read teams" ON public.teams;
CREATE POLICY "Authenticated can read teams" ON public.teams FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.teams FROM anon;

DROP POLICY IF EXISTS "Anyone can read work_topics" ON public.work_topics;
CREATE POLICY "Authenticated can read work_topics" ON public.work_topics FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.work_topics FROM anon;
