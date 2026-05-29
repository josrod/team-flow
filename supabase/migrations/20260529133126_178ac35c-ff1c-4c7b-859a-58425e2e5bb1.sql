CREATE TABLE public.tfs_import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  team_id TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  imported_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'azure_devops',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tfs_import_history_user_team
  ON public.tfs_import_history (user_id, team_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tfs_import_history TO authenticated;
GRANT ALL ON public.tfs_import_history TO service_role;

ALTER TABLE public.tfs_import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own import history"
  ON public.tfs_import_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own import history"
  ON public.tfs_import_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import history"
  ON public.tfs_import_history
  FOR DELETE
  USING (auth.uid() = user_id);