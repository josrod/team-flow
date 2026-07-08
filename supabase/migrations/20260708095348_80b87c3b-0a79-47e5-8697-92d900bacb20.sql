
-- ============================================================
-- Shared team data tables
-- ============================================================

CREATE TABLE public.teams (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'users',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update teams" ON public.teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete teams" ON public.teams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.members (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  avatar text,
  base_capacity integer,
  max_capacity integer,
  login_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read members" ON public.members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert members" ON public.members FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update members" ON public.members FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete members" ON public.members FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER members_updated_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX members_team_id_idx ON public.members(team_id);

CREATE TABLE public.work_topics (
  id text PRIMARY KEY,
  member_id text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('in-progress', 'pending', 'blocked', 'completed')),
  reassigned_from text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_topics TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.work_topics TO authenticated;
GRANT ALL ON public.work_topics TO service_role;
ALTER TABLE public.work_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read work_topics" ON public.work_topics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert work_topics" ON public.work_topics FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update work_topics" ON public.work_topics FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete work_topics" ON public.work_topics FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER work_topics_updated_at BEFORE UPDATE ON public.work_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX work_topics_member_id_idx ON public.work_topics(member_id);

CREATE TABLE public.absences (
  id text PRIMARY KEY,
  member_id text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('vacation','sick-leave','work-travel','other-project','parental-leave')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.absences TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.absences TO authenticated;
GRANT ALL ON public.absences TO service_role;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read absences" ON public.absences FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert absences" ON public.absences FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update absences" ON public.absences FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete absences" ON public.absences FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER absences_updated_at BEFORE UPDATE ON public.absences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX absences_member_id_idx ON public.absences(member_id);

CREATE TABLE public.handovers (
  id text PRIMARY KEY,
  from_member_id text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  to_member_id text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  absence_id text NOT NULL REFERENCES public.absences(id) ON DELETE CASCADE,
  topic_ids text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  handover_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.handovers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.handovers TO authenticated;
GRANT ALL ON public.handovers TO service_role;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read handovers" ON public.handovers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert handovers" ON public.handovers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update handovers" ON public.handovers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete handovers" ON public.handovers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER handovers_updated_at BEFORE UPDATE ON public.handovers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.absences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;

-- ============================================================
-- Seed data (idempotent)
-- ============================================================

INSERT INTO public.teams (id, name, icon, sort_order) VALUES
  ('team-1', 'RODAT', 'shield', 1),
  ('team-2', 'Processing', 'cpu', 2)
ON CONFLICT (id) DO NOTHING;

-- Members
WITH raw(idx, name, role_name, team_id) AS (
  VALUES
    (1,'Carlos','Frontend Dev','team-1'),(2,'María','Backend Dev','team-1'),
    (3,'Andrés','QA Engineer','team-1'),(4,'Laura','Product Manager','team-1'),
    (5,'Diego','UX Designer','team-1'),(6,'Sofía','DevOps','team-1'),
    (7,'Pablo','Data Analyst','team-1'),(8,'Elena','Scrum Master','team-1'),
    (9,'Javier','Tech Lead','team-1'),(10,'Ana','Full Stack Dev','team-1'),
    (11,'Miguel','Security Engineer','team-1'),(12,'Lucía','Mobile Dev','team-1'),
    (13,'Fernando','Cloud Architect','team-1'),(14,'Carmen','Business Analyst','team-1'),
    (15,'Raúl','Support Engineer','team-1'),(16,'Isabel','SRE','team-1'),
    (17,'Tomás','Frontend Dev','team-2'),(18,'Valeria','Backend Dev','team-2'),
    (19,'Héctor','QA Engineer','team-2'),(20,'Patricia','Product Manager','team-2'),
    (21,'Sergio','UX Designer','team-2'),(22,'Daniela','DevOps','team-2'),
    (23,'Adrián','Data Analyst','team-2'),(24,'Marta','Scrum Master','team-2'),
    (25,'Óscar','Tech Lead','team-2'),(26,'Natalia','Full Stack Dev','team-2'),
    (27,'Iván','Security Engineer','team-2'),(28,'Claudia','Mobile Dev','team-2'),
    (29,'Alberto','Cloud Architect','team-2'),(30,'Rosa','Business Analyst','team-2'),
    (31,'Guillermo','Support Engineer','team-2'),(32,'Teresa','SRE','team-2')
)
INSERT INTO public.members (id, team_id, name, role)
SELECT 'member-' || idx, team_id, name, role_name FROM raw
ON CONFLICT (id) DO NOTHING;

-- Work topics: 1-3 per member using the same formula the mock data used
WITH topic_names(i, name) AS (
  VALUES
    (0,'Migración API v3'),(1,'Rediseño checkout'),(2,'Pipeline CI/CD'),(3,'Dashboard analytics'),
    (4,'Módulo de pagos'),(5,'Optimización DB'),(6,'App móvil iOS'),(7,'Sistema de alertas'),
    (8,'Integración SSO'),(9,'Refactor auth'),(10,'Tests E2E'),(11,'Documentación API'),
    (12,'Microservicios'),(13,'Cache Redis'),(14,'Landing page'),(15,'Sistema de logs'),
    (16,'Onboarding flow'),(17,'Feature flags'),(18,'Rate limiting'),(19,'Backup system'),
    (20,'Search engine'),(21,'Notification service'),(22,'User profiles'),(23,'Admin panel'),
    (24,'Billing module'),(25,'Audit trail'),(26,'Config service'),(27,'Health checks'),
    (28,'Load balancer'),(29,'Data export'),(30,'Import wizard'),(31,'Report builder')
),
statuses(i, s) AS (
  VALUES (0,'in-progress'),(1,'pending'),(2,'blocked'),(3,'completed')
),
gen AS (
  SELECT
    mi,
    'member-' || (mi + 1) AS member_id,
    ti,
    ((mi * 3 + ti) % 32) AS topic_idx,
    ((mi + ti) % 4) AS status_idx
  FROM generate_series(0, 31) mi,
       LATERAL generate_series(0, (mi % 3)) ti
)
INSERT INTO public.work_topics (id, member_id, name, description, status)
SELECT
  'topic-' || gen.mi || '-' || gen.ti,
  gen.member_id,
  tn.name,
  'Trabajo activo en ' || lower(tn.name) || ' — responsable.',
  st.s
FROM gen
JOIN topic_names tn ON tn.i = gen.topic_idx
JOIN statuses st ON st.i = gen.status_idx
ON CONFLICT (id) DO NOTHING;

-- Absences (dates relative to today so the seed lands around "now")
INSERT INTO public.absences (id, member_id, type, start_date, end_date) VALUES
  ('abs-1','member-2','vacation',current_date - 2, current_date + 5),
  ('abs-2','member-5','sick-leave',current_date - 1, current_date + 3),
  ('abs-3','member-8','work-travel',current_date + 3, current_date + 10),
  ('abs-4','member-12','vacation',current_date + 7, current_date + 14),
  ('abs-5','member-18','other-project',current_date - 3, current_date + 1),
  ('abs-6','member-21','parental-leave',current_date + 5, current_date + 12),
  ('abs-7','member-25','vacation',current_date + 10, current_date + 17),
  ('abs-8','member-30','sick-leave',current_date + 0, current_date + 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.handovers (id, from_member_id, to_member_id, absence_id, topic_ids, notes, handover_date) VALUES
  ('ho-1','member-2','member-3','abs-1', ARRAY['topic-1-0'], 'Revisar PR #234 pendiente y seguir con la integración del endpoint /users.', current_date - 3),
  ('ho-2','member-5','member-6','abs-2', ARRAY['topic-4-0','topic-4-1'], 'Pipeline desplegado en staging, falta validar producción.', current_date - 2)
ON CONFLICT (id) DO NOTHING;
