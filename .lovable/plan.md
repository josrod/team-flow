# Plan: Sección "Bugs" conectada a una query de Azure DevOps

## 1. Configuración de la query (Ajustes Azure DevOps)

- Añadir una columna `bugs_query_id text` a la tabla `azure_devops_settings` mediante migración.
- En `src/pages/AzureDevOpsSettingsPage.tsx`, añadir un campo nuevo **"Query de Bugs (ID o ruta)"** debajo de los selectores de proyecto/equipo. El usuario pegará el GUID de la query (o ruta `Shared Queries/...`) tal y como aparece en la URL de Azure DevOps. Guardar/leer junto con el resto de ajustes.
- Mostrar un texto de ayuda explicando cómo obtener el GUID desde la URL de la query en ADO.

## 2. Servicio TFS: ejecutar la query

En `src/services/tfs.ts`, añadir `fetchTfsQueryResults(conn, queryId)`:

1. `POST {collection}/{project}/_apis/wit/wiql/{queryId}?api-version=5.0` para obtener la lista de IDs.
   (Si el valor introducido es una ruta tipo `Shared Queries/...`, primero resolverla con `GET …/_apis/wit/queries/{path}?api-version=5.0` y usar el `id` devuelto.)
2. Batch a `…/_apis/wit/workitems?ids=…&fields=System.Id,System.Title,System.AssignedTo,System.State,System.IterationPath,System.AreaPath` (lotes de 200, igual que `runWiqlAndFetch`).
3. Devolver `TfsDiscoveryResult<TfsBug>` con un mapeo a la nueva interfaz `TfsBug { id, title, assignedTo, state, iterationPath, areaPath, url }`.
4. Reutilizar el patrón existente de errores (`TfsError`, mixed-content, timeout, 401/403, CORS).

## 3. Página `/bugs`

Crear `src/pages/BugsPage.tsx`:

- Carga inicial: lee `azure_devops_settings` del usuario en Supabase (igual que hace `TfsImportDialog`). Si falta conexión o falta `bugs_query_id`, muestra una alerta con enlace a `/settings/azure-devops`.
- Llama a `fetchTfsQueryResults` y guarda los bugs en estado local. Botón "Refrescar".
- Tabla shadcn `Table` con columnas: **ID, Título (enlaza al work item en ADO en nueva pestaña), Asignado a, Estado, Iteration Path, Area Path**.
- **Filtros locales** encima de la tabla:
  - Input de búsqueda por texto (título / ID / asignado).
  - `Select` por Asignado a (poblado a partir de los resultados).
  - `Select` por Estado.
  - `Select` por Iteration Path.
- Contador "X bugs" + estado de carga (`Skeleton`) y manejo de errores reutilizando el componente existente `TfsErrorPanel`.

Registrar la ruta en `src/App.tsx`:
```tsx
<Route path="/bugs" element={<ProtectedRoute><AppLayout><BugsPage /></AppLayout></ProtectedRoute>} />
```

## 4. Entrada en la barra lateral

En `src/components/AppSidebar.tsx`, añadir al array `navItems` justo **antes de Azure DevOps**:
```ts
{ title: t.bugs, url: "/bugs", icon: Bug }
```
(icono `Bug` de `lucide-react`).

## 5. Traducciones

En `src/context/LanguageContext.tsx` añadir claves ES/EN:
- `bugs`, `bugsPageTitle`, `bugsPageDescription`
- `bugsColumnId`, `bugsColumnTitle`, `bugsColumnAssignee`, `bugsColumnState`, `bugsColumnIteration`, `bugsColumnArea`
- `bugsFilterSearch`, `bugsFilterAssignee`, `bugsFilterState`, `bugsFilterIteration`, `bugsFilterAll`
- `bugsRefresh`, `bugsCount`, `bugsEmpty`, `bugsLoading`
- `bugsQuerySettingLabel`, `bugsQuerySettingHint`, `bugsNoQueryConfigured`

## 6. Detalles técnicos

- Estricto TypeScript, named exports, sin `any`.
- Usar `useQuery` (React Query) en `BugsPage` con `queryKey: ["tfs-bugs", queryId]` y `staleTime: 60_000`.
- No tocar `src/integrations/supabase/client.ts` ni `types.ts` (se regeneran tras la migración).
- Sin cambios en la lógica de import existente.

## Archivos a crear/modificar

- Migración SQL: añade `bugs_query_id` a `azure_devops_settings`.
- `src/services/tfs.ts` — nueva función `fetchTfsQueryResults` + tipo `TfsBug`.
- `src/pages/AzureDevOpsSettingsPage.tsx` — nuevo input para la query.
- `src/pages/BugsPage.tsx` — nueva página.
- `src/App.tsx` — nueva ruta.
- `src/components/AppSidebar.tsx` — nueva entrada de menú.
- `src/context/LanguageContext.tsx` — traducciones.
