# Panel de PBI en vivo, avance y página de bloqueos

Objetivo: que el panel de PBI muestre el backlog real de Azure DevOps siempre actualizado, con avance por PBI, y que exista una página dedicada a los bloqueos con acciones para resolverlos dentro de la app.

Punto de partida ya existente: el panel principal y la pestaña "Backlog items" ya leen los PBI, sus tareas hijas y las etiquetas directamente de Azure DevOps mediante la conexión del admin, con refresco automático cada 5 minutos y botón "Sincronizar ahora".

## 1. Panel de PBI en vivo

- Mantener el refresco automático cada 5 minutos, al abrir la página y al volver a la pestaña, más el botón manual.
- Añadir al encabezado un indicador claro de frescura: hora de la última sincronización, "sincronizando..." mientras carga y un aviso cuando los datos vienen de la caché porque Azure DevOps no responde.
- Mostrar en el panel una tabla del backlog con una fila por PBI y columnas: id y título, estado (Open, In refinement, In progress, In testing, Closed), responsable, número de tareas hijas y avance.
- Cada fila es clicable y abre un panel de detalle con el estado, responsable, iteración, etiquetas, la lista de tareas hijas con su estado y responsable, y un enlace para abrirlo en Azure DevOps.
- La tabla se puede ordenar por estado, responsable o avance y respeta el alcance interno (RODAT y Processing).

## 2. Avance de cada PBI

- El avance se calcula como tareas hijas cerradas dividido por el total de tareas hijas, tal y como llegan de Azure DevOps.
- Se muestra como barra con el porcentaje y el detalle "3/5 tareas".
- Un PBI sin tareas hijas no muestra porcentaje, sino la etiqueta "sin tareas hijas", para no dar un 0% engañoso.
- El mismo porcentaje aparece en las tarjetas del tablero, en la vista por persona, en la tabla del panel y en el detalle.
- Se añade un resumen arriba del panel: avance medio de los PBI en curso y cuántos están al 100% pero aún no cerrados (candidatos a cerrar).

## 3. Página de bloqueos

Nueva página "Bloqueos" en el menú, agrupada por PBI. Para cada PBI se listan sus bloqueos:

- Ausencia: el responsable del PBI o de una tarea hija está ausente hoy, con el tipo de ausencia y la fecha de vuelta.
- Dependencia: el PBI tiene la etiqueta de espera, con el resto de etiquetas como contexto y los días que lleva sin movimiento.
- Sin responsable: PBI activos sin nadie asignado y tareas hijas activas sin nadie asignado.

Filtros por equipo, persona, tipo de bloqueo y búsqueda; contadores por tipo arriba.

Acciones (todas dentro de la app, sin escribir en Azure DevOps):

- "Crear handover": abre el flujo de handover ya existente con la persona ausente y el PBI precargados.
- "Sugerir responsable": propone compañeros del mismo equipo disponibles hoy y con menos trabajo en curso, y deja constancia de la sugerencia en la app.
- "Marcar como revisado": oculta el bloqueo durante 7 días o hasta que cambie en Azure DevOps, con motivo opcional; se puede deshacer.
- "Abrir en Azure DevOps": enlace directo al elemento.

Las alertas del panel principal enlazan a esta página y muestran el mismo recuento, para que no haya dos cifras distintas.

## Detalles técnicos

1. `src/services/tfs.ts`: añadir `Microsoft.VSTS.Scheduling.CompletedWork` a `BACKLOG_FIELDS` (solo informativo en el detalle) y acotar la rama de `ChangedDate` del WIQL a estados cerrados, para que la ventana de 10 días no arrastre elementos activos antiguos.
2. `src/lib/backlogBoard.ts`: exponer `childrenTotal`, `childrenDone` y un helper puro `completionRatio(card)` que devuelva `null` sin tareas hijas. Tests en `src/test/backlog-board.test.ts`.
3. `src/lib/backlogAlerts.ts`: reutilizar `buildBacklogAlerts` como única fuente de bloqueos; añadir `groupAlertsByItem`, `staleDays` y filtrado por marcas de "revisado". Tests nuevos en `src/test/backlog-alerts.test.ts`.
4. Persistencia de las acciones: tabla `backlog_blocker_reviews` en Lovable Cloud (`item_id`, `alert_kind`, `person`, `reason`, `reviewed_by`, `reviewed_at`, `expires_at`) con RLS y GRANT: lectura para `anon` y `authenticated` (la app es de lectura pública), escritura solo para el admin. Servicio nuevo `src/services/blockerReviewsService.ts`.
5. Componentes nuevos: `src/components/backlog/BacklogProgress.tsx`, `src/components/backlog/BacklogTable.tsx`, `src/components/backlog/BacklogDetailDialog.tsx`, `src/components/blockers/BlockerGroupCard.tsx`, `src/components/blockers/SuggestOwnerDialog.tsx`; página `src/pages/BlockersPage.tsx` y ruta `/blockers` en `src/App.tsx` y `src/components/AppSidebar.tsx`.
6. `src/hooks/use-backlog-sync.ts`: exponer `fromCache` y `staleSince` para el indicador de frescura; mantener el intervalo de 5 minutos.
7. Traducciones ES/EN en `src/context/LanguageContext.tsx` para tabla, avance, detalle, página de bloqueos y acciones.
8. Verificación: `tsgo`, ESLint, Vitest (incluidas las pruebas nuevas) y comprobación en el navegador del panel, la tabla clicable y la página de bloqueos.
