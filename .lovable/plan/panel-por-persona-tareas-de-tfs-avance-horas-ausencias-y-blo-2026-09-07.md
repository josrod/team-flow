# Panel por persona: tareas de TFS, avance, horas, ausencias y bloqueos

## Qué se construye

Un único panel nuevo, "Por persona", que en una sola vista muestra para cada miembro de RODAT y Processing:

- Tareas y PBI de TFS asignados (abiertos, en curso y cerrados recientes).
- Avance: porcentaje de tareas hijas cerradas sobre el total.
- Horas registradas (importación INVENT) de la semana seleccionada.
- Ausencias que solapan esa semana.
- Bloqueos: sin responsable, dependencia externa o ausencia del responsable.
- KPIs por semana: horas registradas, tareas cerradas, avance medio y número de bloqueos, con comparación frente a la semana anterior para ver quién se queda atrás.

Interacciones:

- Selector de semana (semana actual por defecto) y filtro por equipo.
- Orden por avance, horas o bloqueos, para identificar rápidamente a quien va rezagado.
- Cada fila se despliega y muestra sus PBI/tareas con enlace a Azure DevOps y acceso al detalle ya existente.
- Señal visual de "riesgo" cuando hay pocas horas registradas, avance bajo o bloqueos abiertos.

## Actualización de datos

Se mantiene la sincronización automática cada 5 minutos (TFS local no puede notificar cambios por sí solo), y además:

- Se refresca al abrir la página y al volver a la pestaña.
- Botón de refrescar manual que fuerza la consulta y salta la caché.
- Indicador de "última actualización" con aviso cuando los datos están envejeciendo.

## Detalles técnicos

- Nueva ruta `/team-load` (entrada en el menú lateral) con `src/pages/PersonPanelPage.tsx`.
- Lógica pura nueva en `src/lib/personPanel.ts`: agregación por persona (tareas, avance, horas, ausencias, bloqueos), cálculo de KPIs semanales y delta contra la semana previa. Con tests en `src/lib/personPanel.test.ts`.
- Reutiliza `useBacklogSync` (5 min, visibilidad, `forceRefresh`), `summarizeProgress` de `backlogBoard.ts`, `backlogAlerts.ts`, `assigneeMatch.ts`, `internalTeams.ts`, `timeBookingService.ts` y los helpers ISO de semana existentes.
- Componentes de presentación en `src/components/person-panel/`: `PersonPanelTable.tsx`, `PersonKpiCards.tsx`, `PersonRowDetail.tsx`; reutiliza `BacklogProgress` y `BacklogDetailDialog`.
- Datos de horas y ausencias vía la capa de servicios ya existente (React Query donde ya se usa); sin `fetch` directo en componentes.
- Vista de solo lectura: sin escrituras a Azure DevOps ni nuevas tablas.
- Nuevas claves de traducción ES/EN para etiquetas, KPIs y estados de riesgo.
- Verificación: typecheck, lint, tests dirigidos, build y comprobación de la nueva página en el navegador.
