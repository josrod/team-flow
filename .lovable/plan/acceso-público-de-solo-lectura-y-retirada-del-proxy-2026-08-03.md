# Acceso público de solo lectura y retirada del proxy

Objetivo: cualquiera de la intranet abre la app y ve los mismos datos (equipos, ausencias, handovers, tasks, bugs, épicas, en espera) en modo lectura, sin iniciar sesión. Solo tu cuenta admin puede entrar en Ajustes y modificar datos.

## Por qué falla el proxy

Los logs de la función `ado-proxy` muestran `dns error: failed to lookup address information` al intentar llegar a `tfs.roseninspection.net`. El servidor TFS solo existe dentro de la red corporativa, así que la nube nunca podrá alcanzarlo. La única vía viable es que el navegador del visitante (que sí está en la intranet) consulte TFS directamente.

## Cómo quedará

- **Ajustes** (`/settings/azure-devops`): solo admin, con login. Sin cambios de acceso.
- **Resto de páginas**: visibles sin login, en modo lectura. Los botones de crear/editar/borrar y las importaciones solo aparecen si eres admin.
- **Datos de Azure DevOps**: el navegador consulta TFS directamente con la configuración y el token del admin, sin pasar por la nube.
- **Login**: se mantiene para ti (y para quien tenga cuenta); se accede desde el botón de iniciar sesión.

## Nota de seguridad (aceptada)

Al consultar TFS desde el navegador, el token del admin llega al navegador de cualquier visitante de la app, y las tablas de la base de datos pasan a ser legibles de forma anónima. Recomendaciones:

- Usar un token de Azure DevOps de **solo lectura** y con caducidad corta.
- Mantener la app publicada **solo** dentro de la red interna.
- El escáner de seguridad marcará la lectura anónima y la exposición del token como hallazgos esperados; los documentaré en la memoria de seguridad.

## Detalles técnicos

1. **Migración de base de datos**: añadir políticas de lectura para el rol `anon` (y `GRANT SELECT ON ... TO anon`) en `teams`, `members`, `absences`, `handovers`, `work_topics`, `task_handover_notes`, `epic_versions`, `epic_version_assignments`. Sin cambios en escritura: sigue restringida a `has_role(auth.uid(),'admin')`. `azure_devops_settings`, `user_roles` y `tfs_import_history` no se abren.
2. **Rutas** (`src/App.tsx`): eliminar `AuthedRoute` de las páginas de datos (queda el `AppLayout` público); `AdminRoute` se mantiene solo en Ajustes. Se elimina `src/components/AuthedRoute.tsx`.
3. **Función `ado-public-connection`**: quitar `requireUser` y volver a descifrar el PAT con `ADO_PAT_ENC_KEY` (AES-GCM, con soporte de filas legacy sin `iv`), devolviendo el token real en lugar del centinela `__ado_proxy__`.
4. **Retirar el proxy**:
   - Borrar `supabase/functions/ado-proxy/` y su test.
   - En `src/services/tfs.ts`: eliminar `PROXY_PAT_SENTINEL`, `enableTfsProxyMode`, `isProxyConnection`, `proxyEndpoint` y `tfsFetch`; volver a `fetch` directo y reactivar la detección de contenido mixto.
   - En `src/services/adoConfig.ts`: dejar de activar el modo proxy y devolver el PAT real.
   - Eliminar `src/services/proxyDiagnostics.ts` y `src/components/ProxyDiagnosticsPanel.tsx`, y sus referencias y textos en `AzureDevOpsSettingsPage.tsx` y `LanguageContext.tsx`. Los campos de límite de peticiones del proxy dejan de mostrarse.
5. **Modo lectura en UI**: en las páginas de datos, ocultar/desactivar acciones de escritura cuando `isAdmin` es falso (`Index`, `TeamPage`, `AbsencesPage`, `HandoversPage`, `EpicsPage` — gestor y asignación de versiones —, notas de handover en `FeaturesPage`). La barra lateral no muestra Ajustes a no-admins.
6. **Verificación**: `tsgo`, tests existentes (ajustando los que cubren el proxy) y comprobación en el navegador de que las páginas cargan sin sesión y sin acciones de escritura.
