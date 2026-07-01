ALTER TABLE public.azure_devops_settings
  ADD COLUMN IF NOT EXISTS epics_query_id text,
  ADD COLUMN IF NOT EXISTS epics_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.validate_epics_query_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v TEXT;
  seg TEXT;
BEGIN
  v := NEW.epics_query_id;
  IF v IS NULL OR btrim(v) = '' THEN
    NEW.epics_query_id := NULL;
    RETURN NEW;
  END IF;
  v := btrim(v);
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    NEW.epics_query_id := v;
    RETURN NEW;
  END IF;
  IF length(v) > 256 THEN
    RAISE EXCEPTION 'Invalid epics_query_id: path exceeds 256 characters' USING ERRCODE = '22023';
  END IF;
  IF v ~ '[\\?#%&]' THEN
    RAISE EXCEPTION 'Invalid epics_query_id: path contains reserved characters' USING ERRCODE = '22023';
  END IF;
  IF left(v, 1) = '/' OR right(v, 1) = '/' THEN
    RAISE EXCEPTION 'Invalid epics_query_id: path cannot start or end with /' USING ERRCODE = '22023';
  END IF;
  FOREACH seg IN ARRAY string_to_array(v, '/') LOOP
    IF btrim(seg) = '' THEN
      RAISE EXCEPTION 'Invalid epics_query_id: path contains empty segments' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  NEW.epics_query_id := v;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_epics_query_id ON public.azure_devops_settings;
CREATE TRIGGER trg_validate_epics_query_id
  BEFORE INSERT OR UPDATE OF epics_query_id ON public.azure_devops_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_epics_query_id();