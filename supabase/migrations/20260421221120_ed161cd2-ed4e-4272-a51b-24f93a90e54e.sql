ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS last_diagnostic jsonb,
  ADD COLUMN IF NOT EXISTS last_diagnostic_at timestamp with time zone;