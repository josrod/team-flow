# Epics scope — separate Software team settings

## 1. Nueva sección en Azure DevOps Settings

Añadir un bloque "Alcance de Epics" independiente del bloque principal (RODAT), con los mismos campos que hoy tiene la conexión principal, pero aplicados sólo a la vista Epics:

- Proyecto (`epics_project`) — ya existe
- **Equipo** (`epics_team`) — nuevo
- **Area paths** (`epics_area_paths`) — nuevo
- **Iteration paths** (`epics_iteration_paths`) — nuevo
- Query ID (`epics_query_id`) — ya existe
- Tags (`epics_tags`) — ya existe

Reutiliza server URL, collection y PAT del bloque principal (no tiene sentido duplicar credenciales). Si el usuario deja el bloque vacío, la vista Epics cae al scope principal (comportamiento actual).

UI: card separada en la página de settings con título "Alcance de Epics (equipo Software)", debajo del card actual, con los mismos componentes (`TfsAutocompleteInput`, `TfsMultiSelect`) alimentados por el mismo PAT.

## 2. Base de datos

Migración añadiendo tres columnas nullable a `azure_devops_settings`:

- `epics_team text`
- `epics_area_paths text[] not null default '{}'`
- `epics_iteration_paths text[] not null default '{}'`

Sin cambios en policies (ya cubren la tabla completa).

## 3. Consumo en EpicsPage

- Construir la `TfsConnection` de Epics con: `project = epics_project || project`, `team = epics_team || (mismo proyecto ? team : undefined)`.
- Pasar `areaPaths = epics_area_paths.length ? epics_area_paths : areaPaths` al fallback WIQL.
- Actualizar el badge "Proyecto consultado" para mostrar también el equipo efectivo.

## 4. Filtrar Features fuera de Epics

Aunque el query guardado debería devolver sólo Epics, hoy no lo forzamos. Cambios en `fetchTfsEpics` (`src/services/tfs.ts`):

- Añadir `System.WorkItemType` a `EPIC_FIELDS`.
- Tras hidratar los work items, descartar todo lo que no sea exactamente `Epic` (case-insensitive). Así, si el saved query incluye Features/otros tipos, la vista sigue siendo estrictamente de Epics.

## 5. i18n

Nuevas claves ES/EN en `LanguageContext`:

- `adoEpicsScopeTitle`, `adoEpicsScopeDescription`
- `adoEpicsTeamLabel`, `adoEpicsAreaPathsLabel`, `adoEpicsIterationPathsLabel`
- `epicsEffectiveTeamLabel`

## Notas técnicas

- El selector actual "Proyecto de Epics" (dropdown Software/RODAT/Igual) se mantiene tal cual; el nuevo bloque simplemente añade team + areas + iterations.
- La ejecución por ID del saved query (`/_apis/wit/wiql/{id}`) ya respeta el contexto del query; el nuevo `epics_team` sólo se usa cuando cae al fallback WIQL o cuando el usuario quiere forzar contexto distinto.
- No se toca la lógica de tags ni el filtro de la lista/roadmap.
- Sin nuevos tests salvo verificar build.

¿Procedo con la migración y los cambios de UI?
