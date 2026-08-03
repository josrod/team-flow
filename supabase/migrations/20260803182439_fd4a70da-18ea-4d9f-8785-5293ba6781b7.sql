GRANT SELECT ON public.teams TO anon;
GRANT SELECT ON public.members TO anon;
GRANT SELECT ON public.absences TO anon;
GRANT SELECT ON public.handovers TO anon;
GRANT SELECT ON public.work_topics TO anon;
GRANT SELECT ON public.task_handover_notes TO anon;
GRANT SELECT ON public.epic_versions TO anon;
GRANT SELECT ON public.epic_version_assignments TO anon;

CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read members" ON public.members FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read absences" ON public.absences FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read handovers" ON public.handovers FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read work_topics" ON public.work_topics FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read task notes" ON public.task_handover_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read epic versions" ON public.epic_versions FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read epic version assignments" ON public.epic_version_assignments FOR SELECT TO anon USING (true);