CREATE TABLE public.epic_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color_key text NOT NULL DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT epic_versions_name_unique UNIQUE (name)
);

GRANT SELECT ON public.epic_versions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_versions TO authenticated;
GRANT ALL ON public.epic_versions TO service_role;

ALTER TABLE public.epic_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read epic versions" ON public.epic_versions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert epic versions" ON public.epic_versions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update epic versions" ON public.epic_versions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete epic versions" ON public.epic_versions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_epic_versions_updated_at BEFORE UPDATE ON public.epic_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.epic_version_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id text NOT NULL,
  version_id uuid NOT NULL REFERENCES public.epic_versions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT epic_version_assignments_epic_unique UNIQUE (epic_id)
);

GRANT SELECT ON public.epic_version_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epic_version_assignments TO authenticated;
GRANT ALL ON public.epic_version_assignments TO service_role;

ALTER TABLE public.epic_version_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read epic version assignments" ON public.epic_version_assignments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert epic version assignments" ON public.epic_version_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update epic version assignments" ON public.epic_version_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete epic version assignments" ON public.epic_version_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_epic_version_assignments_updated_at BEFORE UPDATE ON public.epic_version_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();