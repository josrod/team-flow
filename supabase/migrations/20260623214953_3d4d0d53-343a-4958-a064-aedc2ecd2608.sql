ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS pat_iv TEXT;

COMMENT ON COLUMN public.azure_devops_settings.pat_encrypted IS
  'When pat_iv IS NULL: legacy plaintext PAT (deprecated). When pat_iv IS NOT NULL: base64 AES-256-GCM ciphertext, key held server-side in edge function secret ADO_PAT_ENC_KEY.';
COMMENT ON COLUMN public.azure_devops_settings.pat_iv IS
  'Base64 96-bit IV used to decrypt pat_encrypted. NULL means legacy plaintext PAT.';