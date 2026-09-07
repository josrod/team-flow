# Nueva pestaña "Backlog items" (PBI) en lugar de Features

Objetivo: sustituir el contenido actual de la pestaña Features por una vista que refleje el tablero de Rodat Backlog items de TFS, mostrando con claridad qué está ejecutando cada persona a nivel de PBI y de sus tareas hijas.

## Cómo funcionará

Dos vistas con un conmutador en la cabecera:

1. **Tablero (como TFS)** — columnas de estado y swimlanes:

```text
                  Open | In refinement | In Progress | In Testing | Closed (10 días)
 Unplanned Work    ...        ...            ...           ...         ...
 Normal Work       ...        ...            ...           ...         ...
```

Cada tarjeta de PBI muestra: id, título, tipo (PBI/Bug con su icono y color), persona asignada, estado, iteración, severidad (bugs), etiquetas (RODAT, Processing, Waiting…), y un contador de tareas hijas completadas (por ejemplo 1/16). Al desplegar la tarjeta se ven las tareas hijas con su estado y su responsable. Clic en el id abre el elemento en TFS.

2. **Por persona** — una sección por miembro del equipo con:
   - resumen: PBIs en curso, tareas hijas activas, elementos con etiqueta Waiting;
   - lista de sus PBIs agrupados por estado, con las tareas hijas anidadas debajo;
   - las personas sin trabajo activo se agrupan al final.

Elementos comunes: buscador por texto/id, filtros por equipo, persona, tipo, etiqueta y estado, botón de refresco (ignora la caché), y contadores por columna igual que en TFS. La preferencia de vista (tablero/persona) y los filtros se guardan en el navegador.

Alcance de datos: todo el trabajo activo (Open, In Refinement, In Progress, In Testing) más los cerrados de los últimos 10 días. Swimlanes separando trabajo no planificado del normal.

## Detalles técnicos

1. **Servicio** (`src/services/tfs.ts`):
   - Nueva `listTfsBacklogItems(conn, areaPaths, iterationPaths, options)` con WIQL sobre `[System.WorkItemType] IN ('Product Backlog Item','Bug')`, filtro de área/iteración configurado y condición de estado: activos siempre + `Closed`/`Done` con `[Microsoft.VSTS.Common.ClosedDate] >= @today - 10`.
   - Campos añadidos a la petición: `System.Parent`, `System.Tags`, `Microsoft.VSTS.Common.Severity`, `Microsoft.VSTS.Common.BacklogPriority`, `Microsoft.VSTS.Scheduling.RemainingWork`, `System.BoardLane`/`System.BoardColumn` cuando estén disponibles.
   - Nueva `listTfsChildTasks(conn, parentIds)` que resuelve las tareas hijas vía WIQL `[System.Parent] IN (...)` en lotes de 200, reutilizando `runWiqlAndFetch`.
   - Ambas envueltas en `withTfsCache` con la misma clave/TTL que el resto (stale-while-revalidate ya existente).
2. **Lógica pura y tests**:
   - `src/lib/backlogBoard.ts`: normalización de estados a las cinco columnas del tablero, detección de swimlane (tag/campo de trabajo no planificado con `Unplanned` como marcador, configurable), agregación PBI → tareas hijas, contadores por columna y por persona, y reglas de "reciente cerrado".
   - Tests en `src/test/backlog-board.test.ts` para columnas, swimlanes, contadores hijos y ventana de 10 días.
3. **UI**:
   - Nueva `src/pages/BacklogItemsPage.tsx` (ruta `/features` mantenida para no romper enlaces; el título de la pestaña pasa a "Backlog items").
   - Componentes nuevos: `src/components/backlog/BacklogBoard.tsx`, `BacklogCard.tsx`, `BacklogChildTasks.tsx`, `BacklogByPerson.tsx`, todos con tokens semánticos existentes (`--status-*`) y sin colores fijos.
   - Reutilización de `TaskTypeFilter`, `WaitingBadge`, `SeverityBadge`, `PriorityBadge`, `TfsErrorPanel`, y de la resolución de personas/equipos de `src/lib/assigneeMatch.ts` e `internalTeams.ts`.
   - `FeaturesPage.tsx` conserva las vistas `tasks` y `workload`; se elimina de él el modo `features`.
4. **Navegación y textos**: `AppSidebar` cambia la etiqueta de Features a "Backlog items" (icono `Kanban`); claves ES/EN nuevas en `src/context/LanguageContext.tsx` para columnas, swimlanes, conmutador de vista y estados vacíos.
5. **Acceso**: la vista es de solo lectura para cualquier visitante, usando la conexión compartida (`loadSharedAdoConnection`) igual que Tasks y Bugs.
6. **Verificación**: `tsgo`, suite de Vitest y comprobación en el navegador de que ambas vistas cargan y filtran correctamente.
