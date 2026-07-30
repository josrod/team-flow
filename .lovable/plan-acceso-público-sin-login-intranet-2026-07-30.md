# Acceso público sin login (intranet)

Objetivo: cualquiera dentro de la intranet abre la app y ve exactamente lo mismo, sin iniciar sesión. Las modificaciones de datos siguen requiriendo login de admin, y la página de login se mantiene accesible pero oculta.

## Qué cambia para el usuario

- Todas las vistas pasan a ser públicas: Inicio, Equipos, Ausencias, Handovers, Tasks, Bugs, Epics, En espera, Workload y Pulse.
- Ya no hay redirecciones a `/auth` al entrar en esas páginas.
- El menú lateral muestra todas las vistas a todo el mundo (salvo Settings, ver más abajo).
- Los botones de edición (crear/editar/borrar miembros, equipos, ausencias, handovers, notas, importaciones) sólo aparecen si hay sesión de admin. Un visitante anónimo ve la información en modo lectura.
- `/auth` sigue existiendo para que el admin entre cuando necesite editar; no se enlaza desde el menú.

## Base de datos

Hoy la lectura está limitada a usuarios autenticados. Se añade lectura anónima manteniendo la escritura sólo para admin:

- Tablas con lectura pública: `teams`, `members`, `absences`, `handovers`, `work_topics`, `task_handover_notes`.
  - Sustituir la política `SELECT` de `authenticated` por una política `SELECT USING (true)` para `anon` y `authenticated`.
  - Añadir `GRANT SELECT ... TO anon` en cada una.
- Sin cambios en las políticas de INSERT/UPDATE/DELETE: siguen exigiendo `has_role(auth.uid(), 'admin')`.
- `user_roles`, `tfs_import_history` y `azure_devops_settings` no se abren a `anon`.

Nota de privacidad: estos datos (nombres, roles, ausencias, notas de handover) quedarán legibles por cualquiera que alcance la URL. Es lo esperado en una intranet cerrada, pero conviene tenerlo presente si la app se publicara fuera.

## Configuración de Azure DevOps (bloqueante para Tasks/Bugs/Epics)

Las vistas de Tasks, Bugs, Epics y En espera leen `azure_devops_settings` desde el navegador, y esa tabla es sólo de admin. Sin tocarlo, un visitante anónimo entraría en esas páginas y no vería datos.

Solución en esta fase, sin exponer el PAT:

- Crear una vista `azure_devops_public_config` (`security_invoker = off`) que exponga sólo los campos no sensibles: `server_url`, `collection`, `project`, `team`, `area_paths`, `iteration_paths`, `bugs_query_id`, `epics_*`. Nunca `pat_encrypted` ni `pat_iv`.
- `GRANT SELECT` de esa vista a `anon` y `authenticated`.
- Las páginas leen la vista cuando no hay sesión de admin y la tabla completa cuando sí la hay.

El PAT sigue cifrado y sólo accesible vía la Edge Function existente. Cómo se gestionan los settings y quién los edita se decide más adelante, tal como indicaste.

## Detalles técnicos

- `src/App.tsx`: quitar `AdminRoute` de `/waiting`, `/pulse`, `/features`, `/absences`, `/workload`. Mantenerlo sólo en `/settings/azure-devops`.
- `src/components/AdminRoute.tsx`: se conserva para Settings.
- `src/components/AppSidebar.tsx`: mostrar todos los enlaces salvo Settings, que sigue condicionado a `isAdmin`.
- `src/context/AuthContext.tsx`: sin cambios; `user` nulo es un estado válido en toda la app.
- `src/context/AppContext.tsx`, `src/components/UnmatchedAssigneesPanel.tsx`, `src/components/TaskHandoverNotes.tsx`, `src/components/TfsImportDialog.tsx`, `src/pages/FeaturesPage.tsx`, `src/pages/WaitingPage.tsx`: ocultar acciones de escritura cuando `!isAdmin` en lugar de asumir sesión.
- Nueva migración con las políticas `anon`, los `GRANT` y la vista pública de configuración.
- Añadir un enlace discreto de "Iniciar sesión" en la cabecera cuando no hay sesión, y "Cerrar sesión" cuando la hay.

## Verificación

- Ejecutar `tsgo` y la suite de tests.
- Comprobar en navegador, sin sesión, que Inicio, Tasks, Bugs, Epics, En espera, Ausencias y Workload cargan datos y no muestran botones de edición.
- Comprobar con sesión de admin que la edición y los Settings siguen funcionando.
- Pasar el linter de seguridad de la base de datos.
