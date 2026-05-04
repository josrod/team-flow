ALTER TABLE public.azure_devops_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.azure_devops_settings;