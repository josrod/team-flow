CREATE TABLE public.time_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_date DATE,
  person TEXT NOT NULL,
  member_id TEXT REFERENCES public.members(id) ON DELETE SET NULL,
  booking_no BIGINT NOT NULL DEFAULT 0,
  duration NUMERIC NOT NULL DEFAULT 0,
  organization TEXT NOT NULL DEFAULT '',
  project_code TEXT NOT NULL DEFAULT '',
  task_name TEXT NOT NULL DEFAULT '',
  activity_kind TEXT NOT NULL DEFAULT '',
  activity_group TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL DEFAULT '',
  remarks TEXT,
  delivery_no INTEGER,
  delivery_position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_bookings TO authenticated;
GRANT ALL ON public.time_bookings TO service_role;

ALTER TABLE public.time_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read time bookings"
  ON public.time_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert time bookings"
  ON public.time_bookings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update time bookings"
  ON public.time_bookings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete time bookings"
  ON public.time_bookings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX time_bookings_natural_key
  ON public.time_bookings (lower(person), work_date, booking_no, delivery_position);
CREATE INDEX time_bookings_work_date_idx ON public.time_bookings (work_date DESC);
CREATE INDEX time_bookings_project_code_idx ON public.time_bookings (project_code);
CREATE INDEX time_bookings_member_id_idx ON public.time_bookings (member_id);

CREATE TRIGGER time_bookings_updated_at
  BEFORE UPDATE ON public.time_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.time_booking_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_file_name TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  persons_count INTEGER NOT NULL DEFAULT 0,
  projects_count INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.time_booking_imports TO authenticated;
GRANT ALL ON public.time_booking_imports TO service_role;

ALTER TABLE public.time_booking_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view time booking imports"
  ON public.time_booking_imports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin owners can insert time booking imports"
  ON public.time_booking_imports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.absences
  ADD COLUMN hours NUMERIC,
  ADD COLUMN activities TEXT[] NOT NULL DEFAULT '{}'::text[];