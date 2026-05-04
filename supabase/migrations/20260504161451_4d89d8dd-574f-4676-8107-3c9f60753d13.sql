ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS area_paths text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS iteration_paths text[] NOT NULL DEFAULT '{}'::text[];