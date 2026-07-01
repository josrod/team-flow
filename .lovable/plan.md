# Plan: Vista "Epics"

Nueva sección de navegación bajo **Bugs** que consume Work Items de tipo Epic desde TFS, filtra por tags configurables y ofrece dos vistas: **Delivery Plan** (roadmap por trimestre) y **Lista**.

## 1. Configuración (Azure DevOps Settings)

Se añaden dos campos nuevos en `AzureDevOpsSettingsPage.tsx` y en la tabla `azure_devops_settings`:

- `epics_query_id` (uuid opcional): ID de un query TFS que devuelve Epics. Si está vacío, se usa un WIQL fijo interno.
- `epics_tags` (text[]): lista de tags permitidos. Solo se muestran los Epics que contengan al menos uno.

Ambos campos entran en el mismo flujo de auto-save y validación ya existente (`validateConnectionFields`, `evaluateSaveGuard`). Se añade una tarjeta "Epics" en el formulario, análoga a la sección de Bugs, con:

- Input de query ID (validado por regex UUID como `bugsQueryId`).
- Multi-input de tags (chips estilo TfsMultiSelect, entrada libre por Enter/coma).

## 2. Capa de servicio (`src/services/tfs.ts`)

Se añaden dos funciones nuevas siguiendo el patrón de `fetchTfsBugsByIterations`:

- `fetchTfsEpicsByQuery(conn, queryId, signal)`: ejecuta el query guardado y expande los Work Items.
- `fetchTfsEpicsByWiql(conn, areaPaths, signal)`: WIQL de fallback:
  `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Epic' AND [System.TeamProject] = @project [AND System.AreaPath UNDER ...]`.

Ambas devuelven `{ items: TfsEpic[]; error?: TfsError }`. Nuevo tipo:

```ts
export interface TfsEpic {
  id: number;
  title: string;
  state: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  tags: string[];        // parseado del campo System.Tags (";" separado)
  targetDate?: string;   // Microsoft.VSTS.Scheduling.TargetDate
  startDate?: string;    // Microsoft.VSTS.Scheduling.StartDate
  changedDate?: string;
  url: string;
}
```

Wrapper `fetchTfsEpics(conn, { queryId, tags, areaPaths }, signal)` que:
1. Llama a `fetchTfsEpicsByQuery` si `queryId` presente, si no `fetchTfsEpicsByWiql`.
2. Filtra por intersección con `tags` (case-insensitive) si la lista no está vacía.

## 3. Nueva página `src/pages/EpicsPage.tsx`

Estructura basada en `BugsPage.tsx` para consistencia:

- Carga de `azure_devops_settings` (misma lógica de decrypt PAT).
- Estado vacío con enlace a Settings si faltan `epics_query_id` o `epics_tags`.
- Barra superior: buscador por título/ID, filtro por Estado (multi-select) y por Tag (multi-select derivado de los datos).
- Tabs shadcn `<Tabs defaultValue="roadmap">`:
  - **Delivery Plan (por defecto)** — componente `EpicsRoadmap`.
  - **Lista** — componente `EpicsTable`.

### 3.1 `EpicsRoadmap.tsx`

Roadmap por trimestre a partir del `targetDate`:

- Agrupa Epics por `Q{n} YYYY` calculado desde `targetDate` (`Math.floor(month/3)+1`).
- Bucket adicional **"Sin fecha"** para Epics sin `targetDate`.
- Layout: rejilla horizontal con scroll, una columna por trimestre visible desde el trimestre actual hasta el más lejano encontrado (mínimo 4 columnas: Q actual + 3 siguientes).
- Cada Epic es una `Card` compacta: título, ID (link a TFS), estado (StatusBadge), assignee (avatar/iniciales), tags como badges pequeños, y `targetDate` formateado `DD/MM/YYYY`.
- Ordenación dentro de cada columna: por `targetDate` ascendente y luego por estado.
- Header por columna con contador y rango de fechas (`Q2 2026 · Abr–Jun · 5 epics`).

```text
┌──── Q2 2026 ────┐┌──── Q3 2026 ────┐┌──── Q4 2026 ────┐┌──── Sin fecha ────┐
│ [Epic card]     ││ [Epic card]     ││ [Epic card]     ││ [Epic card]       │
│ [Epic card]     ││ [Epic card]     ││                 ││                   │
└─────────────────┘└─────────────────┘└─────────────────┘└───────────────────┘
```

### 3.2 `EpicsTable.tsx`

Tabla ordenable (patrón de BugsPage): ID, Título, Estado, Assignee, Tags, Área, Target Date, Changed Date. Clic en fila abre `EpicDetailDialog` (calcado de `BugDetailDialog`, adaptado a Epic).

## 4. Navegación

- `AppSidebar.tsx`: nuevo item `{ title: t.epics, url: "/epics", icon: Target }` insertado inmediatamente después de Bugs.
- `App.tsx`: ruta `/epics` protegida usando `AppLayout` y la nueva `EpicsPage`.

## 5. i18n

Se añaden claves en `src/context/LanguageContext.tsx` (ES/EN):

- `epics`, `epicsPageTitle`, `epicsPageDescription`
- `epicsEmptyNoSettings`, `epicsEmptyNoTags`, `epicsNoResults`
- `epicsTabRoadmap`, `epicsTabList`
- `epicsColTargetDate`, `epicsColTags`, `epicsColArea`, `epicsColState`, `epicsColAssignee`
- `epicsFilterTags`, `epicsFilterState`, `epicsNoDateBucket`
- `adoEpicsSectionTitle`, `adoEpicsQueryIdLabel`, `adoEpicsTagsLabel`, `adoEpicsTagsHint`

## 6. Cambios en base de datos

Migración añadiendo dos columnas opcionales a `azure_devops_settings`:

- `epics_query_id uuid null`
- `epics_tags text[] not null default '{}'`

Sin cambios de RLS (la tabla ya está protegida por `user_id`).

## 7. Detalles técnicos

- Aborto y timeout de fetch: patrón `AbortController` de `BugsPage` (`LOAD_EPICS_TIMEOUT_MS = 20000`).
- Cálculo trimestre: función pura en `src/lib/quarters.ts` con test unitario (`getQuarterKey`, `getQuarterRange`).
- Parseo de tags TFS: función pura `parseTfsTags(raw?: string): string[]` en `src/lib/tfsTags.ts` con test.
- Formato de fechas: `DD/MM/YYYY` (regla de proyecto).
- Iconos: `Target` de lucide-react para Epics; badges de tags con `Badge variant="secondary"`.
- El roadmap usa scroll horizontal en pantallas estrechas; en móvil las columnas colapsan a acordeón (patrón `useIsMobile`).

## 8. Tests

- `src/test/quarters.test.ts` — trimestre y rangos.
- `src/test/tfs-tags.test.ts` — parseo y filtrado por tags (intersección, case-insensitive).
- `src/test/epics-page-empty-state.test.tsx` — renderiza empty state cuando faltan settings.

## 9. Fuera de alcance (para no ampliar la tarea)

- Edición de Epics desde la app.
- Sincronización automática o notificaciones.
- Sub-agrupación por Feature/PBI hija dentro del roadmap.
