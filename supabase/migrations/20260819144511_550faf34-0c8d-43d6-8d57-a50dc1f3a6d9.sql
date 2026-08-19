CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('time_booking', 'absences')),
  source_file_name TEXT NOT NULL,
  range_from DATE,
  range_to DATE,
  rows_processed INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  persons_count INTEGER NOT NULL DEFAULT 0,
  projects_count INTEGER NOT NULL DEFAULT 0,
  row_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_history TO authenticated;
GRANT ALL ON public.import_history TO service_role;

ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view import history"
  ON public.import_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owners can insert import history"
  ON public.import_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX import_history_created_at_idx ON public.import_history (created_at DESC);

INSERT INTO public.import_history (user_id, kind, source_file_name, imported_count, rows_processed, persons_count, projects_count, row_errors, created_at)
SELECT user_id, 'time_booking', source_file_name, imported_count, imported_count, persons_count, projects_count, warnings, created_at
FROM public.time_booking_imports;

DROP TABLE public.time_booking_imports;