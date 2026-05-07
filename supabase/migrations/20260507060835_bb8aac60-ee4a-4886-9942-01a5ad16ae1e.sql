-- Table for handover annotations (notes, links, next steps) on tasks.
-- Visibility: any authenticated user can read; only the author can edit/delete.
CREATE TABLE public.task_handover_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'link', 'step')),
  content TEXT NOT NULL,
  url TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  author_id UUID NOT NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_handover_notes_task_id ON public.task_handover_notes(task_id);
CREATE INDEX idx_task_handover_notes_author ON public.task_handover_notes(author_id);

ALTER TABLE public.task_handover_notes ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all annotations
CREATE POLICY "Authenticated users can read all task notes"
  ON public.task_handover_notes
  FOR SELECT
  TO authenticated
  USING (true);

-- Authors can insert (and must set themselves as author)
CREATE POLICY "Authenticated users can insert their own notes"
  ON public.task_handover_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- Only the author can update their own notes
CREATE POLICY "Authors can update their own notes"
  ON public.task_handover_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Only the author can delete their own notes
CREATE POLICY "Authors can delete their own notes"
  ON public.task_handover_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

CREATE TRIGGER update_task_handover_notes_updated_at
  BEFORE UPDATE ON public.task_handover_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();