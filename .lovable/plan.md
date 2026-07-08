
# Compartir la app manteniendo páginas privadas

## Objetivo

- Cualquiera con el enlace puede entrar sin login y ver: Dashboard, Teams, Handovers, Tasks, Bugs, Epics, Pulse.
- Solo tu cuenta (admin) puede ver: Settings (Azure DevOps), Features, Absences, Workload.
- Nadie que no sea admin puede modificar datos ni ver los settings/PAT de Azure DevOps.

## Modelo de acceso

Rol admin identificado por tu `user_id` en una tabla `user_roles` (patrón seguro estándar, nunca en `profiles`).

```text
Visitante anónimo ─► ve páginas públicas (solo lectura)
Usuario logueado no-admin ─► ve páginas públicas (solo lectura)
Tú (admin) ─► ve todo + puede editar
```

## Cambios en el frontend

1. **`ProtectedRoute` → `AdminRoute`**: nuevo componente que exige `user` **y** rol `admin`. Si no cumple, redirige a `/`.
2. **`App.tsx`**: quitar `ProtectedRoute` de las rutas públicas y envolver con `AdminRoute` solo:
   - `/settings/azure-devops`
   - `/features`
   - `/absences`
   - `/workload`
   Las demás rutas quedan accesibles sin login dentro de `AppLayout`.
3. **`AppSidebar`**: ocultar los enlaces Settings / Features / Absences / Workload cuando el usuario no sea admin. Mostrar botón "Login como admin" cuando no haya sesión, en vez de solo el email.
4. **`AuthContext`**: añadir `isAdmin: boolean` cargado tras `getUser()` consultando `has_role(auth.uid(),'admin')`.
5. **Botones de edición** (crear/editar/borrar members, teams, handovers, tasks, notas, import/export, reset): deshabilitados u ocultos cuando `!isAdmin`. Toda la lógica de escritura queda protegida en cliente + backend.
6. **`AzureDevOpsSettingsPage`**: además del guard de ruta, no cargar `azure_devops_settings` si no eres admin.

## Cambios en el backend (Lovable Cloud)

Migración SQL:

1. `create type app_role as enum ('admin');`
2. Tabla `user_roles(user_id, role, unique(user_id, role))` con RLS + `has_role()` security definer (patrón estándar).
3. **Insertar tu `user_id` como admin** durante la migración (te pediré confirmación del email en build).
4. **Ajustar RLS de tablas existentes** para permitir lectura pública y escritura solo admin:
   - `task_handover_notes`: `SELECT` a `anon` + `authenticated`; `INSERT/UPDATE/DELETE` solo si `has_role(auth.uid(),'admin')`.
   - `azure_devops_settings`: mantener restringido al owner (solo tú lo usas); añadir política que exija admin explícitamente. **No** exponer `pat_encrypted` a anon.
   - `tfs_import_history`: igual, solo admin.
   - `GRANT SELECT` a `anon` donde aplique.
5. **Edge function `tfs-pat-vault`**: verificar rol admin del caller antes de encrypt/decrypt.

## Datos locales (AppContext / localStorage)

Los datos de teams, members, handovers, tasks, etc. viven en `localStorage` del navegador — no en la nube. Esto significa:

- Cada visitante verá **su propio estado local vacío** al entrar por primera vez, no tus datos.
- Para que el equipo vea tus datos reales necesitamos publicar el estado. Opciones:
  - **(a) Recomendada)** Migrar los datos compartidos a Supabase con RLS de lectura pública y escritura admin. Es trabajo mayor y lo abordamos en un plan aparte.
  - **(b) Rápida)** Exportar el JSON desde tu cuenta y compartirlo; cada usuario lo importa. No es "compartir en vivo".

**Decisión pendiente**: confirma si quieres que en este mismo plan incluyamos la migración (a). Si es sí, lo extendemos; si no, este plan cubre solo el control de acceso y el equipo verá inicialmente estado vacío hasta que decidamos la sincronización.

## Verificación

- Playwright: navegar a `/features`, `/absences`, `/workload`, `/settings/azure-devops` sin sesión → redirige a `/`.
- Login con tu cuenta → aparecen los 4 enlaces y las páginas cargan.
- Login con otra cuenta cualquiera → no aparecen los enlaces; acceso directo por URL redirige a `/`.
- Escaneo de seguridad post-migración (`security--run_security_scan`).
