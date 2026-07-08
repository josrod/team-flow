
# Migrar datos compartidos a Lovable Cloud

## Objetivo

Que cualquiera con el enlace vea los mismos teams, members, absences, handovers y work topics que tú. Solo el admin puede crear/editar/borrar.

## Esquema en Lovable Cloud

Cinco tablas nuevas en `public`, todas con lectura pública (`anon` + `authenticated`) y escritura solo admin (vía `has_role(auth.uid(),'admin')`):

```text
teams        (id text PK, name text, icon text, sort_order int)
members      (id text PK, team_id text FK→teams, name, role, avatar,
              base_capacity int, max_capacity int, login_name)
work_topics  (id text PK, member_id text FK→members, name, description,
              status text, reassigned_from text)
absences     (id text PK, member_id text FK→members, type text,
              start_date date, end_date date)
handovers    (id text PK, from_member_id text FK→members,
              to_member_id text FK→members, absence_id text FK→absences,
              topic_ids text[], notes text, created_at date)
```

- Uso de PK `text` para preservar los IDs existentes (`team-1`, `member-3`, etc.) y no romper referencias en localStorage/exports.
- `ON DELETE CASCADE` para mantener la limpieza al borrar team/member.
- Cada tabla con `created_at` / `updated_at` + trigger de `updated_at`.
- Grants explícitos: `SELECT` a `anon` y `authenticated`; `INSERT/UPDATE/DELETE` a `authenticated` restringido por policy admin; `ALL` a `service_role`.

## Seed inicial

Migración que también inserta los datos actuales de `src/data/mock-data.ts` (teams, members, work topics, absences, handovers) para que la app arranque con contenido real. Usa `ON CONFLICT DO NOTHING` para ser idempotente.

## Refactor de `AppContext`

Reescribo `AppProvider` para:

1. Cargar las 5 colecciones desde Supabase al montar (una consulta por tabla).
2. Suscribirse a `postgres_changes` en cada tabla → actualiza el estado en vivo (todos los visitantes ven cambios sin recargar).
3. Cada mutación (`addTeam`, `updateMember`, `deleteHandover`, …) hace la llamada a Supabase; el listener de realtime aplica el cambio local.
4. Si `!isAdmin`, las mutaciones muestran toast "solo admin" y no llaman a la base de datos.
5. Se conservan `exportData` (genera JSON con el estado en memoria) e `importData` (inserta en Supabase en lote, solo admin).
6. Se elimina el uso de `localStorage` y el helper `loadFromStorage`.

Los tests que mockean `useApp` no cambian; los que renderizan `AppProvider` con Supabase ya lo mockean.

## Frontend

- `AppSidebar`: los botones import/export/reset ya están detrás de `isAdmin` (hecho en el turno anterior).
- Se revisa que los diálogos de creación/edición estén ocultos o deshabilitados para no-admins (Teams, Members, Absences, Handovers, WorkTopics). Los uso en:
  - `TeamPage` (add/edit member, edit team, add absence)
  - `HandoversPage` (crear handover)
  - `AbsencesPage` (admin-only ya por ruta)
  - Diálogos varios de member/team

## Verificación

1. Playwright sin login: navega `/`, `/team/team-1`, `/handovers` — ve los datos reales.
2. Playwright con admin: crea un member y compruebo que aparece; refresca en otra sesión anónima y sigue ahí.
3. Playwright con usuario no-admin: no ve botones "Añadir", los intentos directos fallan en RLS.
4. Tests unitarios siguen pasando.

## Fuera de alcance

- `azure_devops_settings`, `tfs_import_history`, `task_handover_notes` ya están en Cloud y no se tocan.
- No migro los datos del `localStorage` actual del navegador del admin automáticamente — el seed viene de `mock-data.ts`. Si tienes cambios locales que quieres preservar, primero exporta el JSON y después de la migración lo importas desde el sidebar. ¿Quieres que además añada un botón "Migrar mi localStorage a la nube" para hacerlo en un clic?

