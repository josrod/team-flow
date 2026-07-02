ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS epics_team text,
  ADD COLUMN IF NOT EXISTS epics_area_paths text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS epics_iteration_paths text[] NOT NULL DEFAULT '{}'::text[];