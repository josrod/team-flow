ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS server_url text,
  ADD COLUMN IF NOT EXISTS collection text,
  ADD COLUMN IF NOT EXISTS team text;

ALTER TABLE public.azure_devops_settings
  ALTER COLUMN organization DROP NOT NULL;