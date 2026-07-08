
-- Convert has_role to SECURITY INVOKER. The user_roles RLS policy allows every
-- authenticated user to read their own rows, which is exactly what
-- has_role(auth.uid(), ...) needs. This removes the "SECURITY DEFINER
-- executable by signed-in users" linter warning without changing behavior.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
