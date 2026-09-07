CREATE TABLE public.backlog_blocker_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id bigint NOT NULL,
  alert_kind text NOT NULL,
  person text,
  reason text,
  suggested_member_id text REFERENCES public.members(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX backlog_blocker_reviews_item_idx ON public.backlog_blocker_reviews (item_id);
CREATE INDEX backlog_blocker_reviews_expires_idx ON public.backlog_blocker_reviews (expires_at);

GRANT SELECT ON public.backlog_blocker_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_blocker_reviews TO authenticated;
GRANT ALL ON public.backlog_blocker_reviews TO service_role;

ALTER TABLE public.backlog_blocker_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read blocker reviews"
ON public.backlog_blocker_reviews
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can insert blocker reviews"
ON public.backlog_blocker_reviews
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update blocker reviews"
ON public.backlog_blocker_reviews
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blocker reviews"
ON public.backlog_blocker_reviews
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER backlog_blocker_reviews_updated_at
BEFORE UPDATE ON public.backlog_blocker_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();