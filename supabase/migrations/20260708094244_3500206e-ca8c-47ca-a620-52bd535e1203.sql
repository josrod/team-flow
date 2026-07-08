
-- 1) Role enum + table
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3) Seed the admin (the project owner)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'jrodriguezgonzalez@rosen-group.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) task_handover_notes: public read, admin write
DROP POLICY IF EXISTS "Authenticated users can insert their own notes" ON public.task_handover_notes;
DROP POLICY IF EXISTS "Authenticated users can read all task notes" ON public.task_handover_notes;
DROP POLICY IF EXISTS "Authors can delete their own notes" ON public.task_handover_notes;
DROP POLICY IF EXISTS "Authors can update their own notes" ON public.task_handover_notes;

GRANT SELECT ON public.task_handover_notes TO anon;

CREATE POLICY "Anyone can read task notes"
  ON public.task_handover_notes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert task notes"
  ON public.task_handover_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = author_id);

CREATE POLICY "Admins can update task notes"
  ON public.task_handover_notes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete task notes"
  ON public.task_handover_notes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) azure_devops_settings: only admin owners
DROP POLICY IF EXISTS "Users can delete their own settings" ON public.azure_devops_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.azure_devops_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.azure_devops_settings;
DROP POLICY IF EXISTS "Users can view their own settings" ON public.azure_devops_settings;

CREATE POLICY "Admin owners can view settings"
  ON public.azure_devops_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can insert settings"
  ON public.azure_devops_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can update settings"
  ON public.azure_devops_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can delete settings"
  ON public.azure_devops_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

-- 6) tfs_import_history: only admin owners
DROP POLICY IF EXISTS "Users can delete their own import history" ON public.tfs_import_history;
DROP POLICY IF EXISTS "Users can insert their own import history" ON public.tfs_import_history;
DROP POLICY IF EXISTS "Users can view their own import history" ON public.tfs_import_history;

CREATE POLICY "Admin owners can view import history"
  ON public.tfs_import_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can insert import history"
  ON public.tfs_import_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can delete import history"
  ON public.tfs_import_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));
