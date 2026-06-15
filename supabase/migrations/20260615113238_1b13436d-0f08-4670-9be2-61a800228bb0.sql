-- Backend validation for azure_devops_settings.bugs_query_id
CREATE OR REPLACE FUNCTION public.validate_bugs_query_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v TEXT;
  seg TEXT;
BEGIN
  v := NEW.bugs_query_id;

  -- Optional field: null/empty/whitespace is allowed
  IF v IS NULL OR btrim(v) = '' THEN
    NEW.bugs_query_id := NULL;
    RETURN NEW;
  END IF;

  v := btrim(v);

  -- Accept canonical GUID
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    NEW.bugs_query_id := v;
    RETURN NEW;
  END IF;

  -- Otherwise validate as Azure DevOps query path
  IF length(v) > 256 THEN
    RAISE EXCEPTION 'Invalid bugs_query_id: path exceeds 256 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v ~ '[\\?#%&]' THEN
    RAISE EXCEPTION 'Invalid bugs_query_id: path contains reserved characters'
      USING ERRCODE = '22023';
  END IF;

  IF left(v, 1) = '/' OR right(v, 1) = '/' THEN
    RAISE EXCEPTION 'Invalid bugs_query_id: path cannot start or end with /'
      USING ERRCODE = '22023';
  END IF;

  -- No empty segments
  FOREACH seg IN ARRAY string_to_array(v, '/') LOOP
    IF btrim(seg) = '' THEN
      RAISE EXCEPTION 'Invalid bugs_query_id: path contains empty segments'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  NEW.bugs_query_id := v;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bugs_query_id_trigger ON public.azure_devops_settings;

CREATE TRIGGER validate_bugs_query_id_trigger
BEFORE INSERT OR UPDATE OF bugs_query_id ON public.azure_devops_settings
FOR EACH ROW
EXECUTE FUNCTION public.validate_bugs_query_id();