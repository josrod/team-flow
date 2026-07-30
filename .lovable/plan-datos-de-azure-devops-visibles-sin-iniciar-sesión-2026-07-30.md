# Datos de Azure DevOps visibles sin iniciar sesión

Objetivo: cualquier persona de la intranet que abra la app ve los mismos datos de Azure DevOps que ve el admin, en modo solo lectura, sin login.

## Cómo funcionará

- El admin sigue siendo el único que configura la conexión (servidor, colección, proyecto, rutas, queries y token) en Ajustes.
- Al cargar Tasks, Bugs, Epics o En espera, la app pedirá al backend la configuración activa del admin y usará esas credenciales para consultar Azure DevOps desde el navegador del visitante (necesario porque el servidor TFS solo es alcanzable desde la red corporativa).
- Los visitantes sin sesión no pueden crear, editar ni borrar nada: se mantienen los permisos actuales de escritura solo para admins, y los ajustes siguen protegidos.

## Nota de seguridad (aceptada)

Como las consultas se hacen desde el navegador, el token del admin llega al navegador de cualquier visitante de la intranet. Recomendación: usar un token de Azure DevOps de solo lectura y con caducidad corta, y mantener la app publicada únicamente dentro de la red interna.

## Detalles técnicos

1. Nueva Edge Function `ado-public-connection` (sin verificación de JWT):
   - Lee con service role la fila más reciente de `azure_devops_settings`.
   - Descifra `pat_encrypted`/`pat_iv` con `ADO_PAT_ENC_KEY` (misma lógica AES-GCM que `tfs-pat-vault`); soporta filas legacy sin `iv`.
   - Devuelve `{ serverUrl, collection, project, team, pat, areaPaths, iterationPaths, bugsQueryId, epicsQueryId, epicsTags, epicsProject, epicsTeam, epicsAreaPaths, epicsIterationPaths }`.
   - Responde 404 si no hay configuración; CORS habilitado.
2. `src/services/adoConfig.ts`: nueva función `loadSharedAdoConnection()` que invoca la function, cachea el resultado en memoria por sesión de página y devuelve `TfsConnection` + scopes. Mantener `loadPublicAdoConfig` para los enlaces.
3. Páginas `FeaturesPage`, `BugsPage`, `EpicsPage`, `WaitingPage`: sustituir el bloque "si no hay usuario → error de sesión requerida" por la carga vía `loadSharedAdoConnection()`. El admin autenticado puede seguir usando su propia fila; el resto usa la compartida. Se elimina el mensaje `errAdoSignInRequired` de estas vistas y se sustituye por "No hay configuración de Azure DevOps disponible" cuando la function no devuelve datos.
4. Textos nuevos/ajustados en `src/context/LanguageContext.tsx` (ES/EN).
5. Verificación: `tsgo`, tests existentes y comprobación en el navegador de que las vistas cargan datos sin sesión.
