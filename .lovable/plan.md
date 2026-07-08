## Diagnóstico

La migración anterior revocó `EXECUTE` sobre las funciones SECURITY DEFINER (`has_role`, `update_updated_at_column`, `validate_bugs_query_id`, `validate_epics_query_id`) para los roles `PUBLIC`, `anon` y `authenticated`.

Consecuencias en la app:

- Todas las políticas RLS de escritura usan `has_role(auth.uid(), 'admin')` en `USING` / `WITH CHECK`. Postgres evalúa esa función bajo el rol de la sesión (`authenticated`), que ahora no tiene `EXECUTE` → cualquier INSERT/UPDATE/DELETE en `azure_devops_settings`, `teams`, `members`, `work_topics`, `absences`, `handovers` falla con "permission denied for function has_role".
- Por eso guardar los settings de Azure DevOps devuelve error y el import de JSON (que hace inserts masivos) también rompe.
- Los triggers usan `update_updated_at_column` y `validate_*_query_id`; al no tener `EXECUTE` para `authenticated`, cualquier insert/update disparado desde el cliente también falla.

## Plan

1. Nueva migración que restaura `EXECUTE` a `authenticated` en las cuatro funciones (necesarias para RLS y triggers desde el cliente). `anon` y `PUBLIC` siguen sin acceso.
2. Marcar de nuevo los dos hallazgos de seguridad (`SUPA_anon_security_definer_function_executable`, `SUPA_authenticated_security_definer_function_executable`) como aceptados con justificación en `security-memory`: son helpers internos requeridos por políticas/triggers y su superficie ya está limitada (SECURITY DEFINER con `search_path` fijo, sin lectura de datos sensibles y sin efectos secundarios accesibles por RPC útil para un atacante).

### SQL de la migración

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bugs_query_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_epics_query_id() TO authenticated;
```

## Verificación

- Volver a intentar guardar Settings de Azure DevOps → sin error.
- Volver a hacer import de JSON → inserts se completan.
- Consultar `pg_proc.proacl` para confirmar `authenticated=X`.