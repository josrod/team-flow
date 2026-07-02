# Nuevas visualizaciones en la página de Epics

Añadir dos vistas complementarias a la actual (lista/roadmap) para que el equipo entienda mejor el trabajo que viene: **Timeline por quarters** y **Heatmap de carga**. Se integran como pestañas en `EpicsPage`, reutilizando el mismo dataset (`epics` ya filtrado por scope Software) para evitar llamadas extra a Azure DevOps.

## 1. Selector de vistas

En `src/pages/EpicsPage.tsx`, sobre el contenido actual, añadir un `Tabs` con tres pestañas:

- `list` — vista actual (roadmap por quarter, sin cambios).
- `timeline` — nueva vista Gantt.
- `heatmap` — nueva matriz de carga.

Persistir la pestaña activa en `localStorage` (`epics-view-mode`) para respetar la preferencia entre sesiones.

## 2. Timeline / Gantt por quarters

Nuevo componente `src/components/EpicsTimeline.tsx`.

Comportamiento:

- Eje X: quarters visibles (usar `ensureUpcomingQuarters` de `src/lib/quarters.ts` para current + 3 quarters, con opción de mostrar 2/4/6).
- Eje Y: una fila por Epic ordenada por `startDate` ascendente (Epics sin fecha van al final agrupados).
- Cada Epic se dibuja como una barra horizontal desde `startDate` (o inicio del quarter en curso si falta) hasta `targetDate` (o fin del último quarter visible si falta), con estilo `border-dashed` cuando alguna fecha es inferida.
- Color de barra según `state` reutilizando los tokens existentes (`New`, `Active`, `Resolved`, `Closed`) — nada de colores hardcoded, usar clases semánticas del tema.
- Hover: tooltip con `id`, `title`, `assignedTo`, `areaPath`, fechas.
- Click: abrir `EpicDetailDrawer` existente.
- Línea vertical "Hoy" superpuesta.
- Agrupación opcional (Select superior): `Ninguna` | `Area path` | `Assignee` — cuando se agrupa, se pinta un separador con el nombre del grupo y las filas debajo.
- Scroll horizontal cuando el rango excede el ancho; sticky la columna de títulos a la izquierda (max 260px, `truncate`).

## 3. Heatmap de carga por quarter

Nuevo componente `src/components/EpicsHeatmap.tsx`.

Comportamiento:

- Matriz: filas = Area Path (o Assignee, seleccionable), columnas = quarters visibles.
- Celda = número de Epics activos en ese quarter para esa fila. Un Epic cuenta en todos los quarters que solapa según `startDate`/`targetDate`; si faltan ambas, entra en la columna "Sin fecha".
- Intensidad de color escalada al máximo de la matriz (5 pasos usando tokens `bg-primary/10 → /80`), mostrando el número dentro de la celda.
- Tooltip por celda: lista de Epics (id + title, hasta 5 + "+N").
- Click en celda: abre un `Dialog` con la lista completa filtrable, cada item abre el `EpicDetailDrawer`.
- Fila "Total" al final y columna "Total" a la derecha.

## 4. Datos y utilidades

- Reutilizar helpers de `src/lib/quarters.ts` (`ensureUpcomingQuarters`, `bucketForDate`, `quarterRange`, `quarterLabel`).
- Nueva utilidad `src/lib/epicSpan.ts` con `getEpicQuarterSpan(epic, visibleBuckets)` que devuelve los buckets que solapa (usada por timeline y heatmap).
- Sin cambios en `src/services/tfs.ts` ni migraciones.

## 5. i18n

Nuevas claves ES/EN en `src/context/LanguageContext.tsx`:

- `epicsViewList`, `epicsViewTimeline`, `epicsViewHeatmap`
- `epicsTimelineGroupBy`, `epicsGroupNone`, `epicsGroupArea`, `epicsGroupAssignee`
- `epicsTimelineTodayLabel`, `epicsTimelineNoDatesHint`
- `epicsHeatmapRowBy`, `epicsHeatmapNoDateColumn`, `epicsHeatmapTotal`, `epicsHeatmapCellDialogTitle`

## 6. Tests

- `src/test/epic-span.test.ts`: casos de `getEpicQuarterSpan` (sin fechas, solo start, solo target, rango que cruza varios quarters).

## Notas técnicas

- Todo el layout con Tailwind + shadcn (`Tabs`, `Tooltip`, `Dialog`, `Select`, `ScrollArea`). Sin CSS inline salvo `style={{ width, left }}` en las barras del timeline (calculadas en JS).
- Nada de nuevas llamadas a Azure DevOps: ambas vistas trabajan sobre el array `epics` ya cargado.
- Fechas en formato DD/MM/YYYY.
