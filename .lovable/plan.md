# Horas planificadas vs registradas en "Por persona"

## Qué se añade

Dentro de la vista "Por persona" (/team-load), para la semana seleccionada:

- Horas planificadas por capacidad: 8 h por día laborable de la semana, descontando los días de ausencia de la persona.
- Horas planificadas según TFS: suma de la estimación de las tareas hijas asignadas a la persona que están abiertas o en curso (Original Estimate; si falta, Remaining Work).
- Horas registradas (importación INVENT) de esa semana, ya disponibles.
- Avance semanal: porcentaje registrado sobre planificado, con barra por persona.
- Desviación: diferencia en horas y en porcentaje frente a la capacidad, marcada cuando supera ±15 % (por debajo = infracarga, por encima = sobrecarga).

Presentación:

- Nuevas tarjetas de resumen arriba: planificado por capacidad, planificado según TFS, registrado y número de personas desviadas.
- Nuevas columnas en la tabla: "Plan (capacidad)", "Plan (TFS)", "Registradas", "Avance" y "Desviación" con señal de color.
- Nueva opción de orden: "Mayor desviación".
- Al desplegar una fila, un pequeño desglose: capacidad, ausencias descontadas, estimación TFS y registradas.
- La señal de riesgo existente incorpora la desviación de horas.

## Detalles técnicos

- `src/lib/personPanel.ts`: nuevos campos por fila (`plannedCapacityHours`, `plannedEstimateHours`, `weeklyProgressPercent`, `deviationHours`, `deviationPercent`, `deviationFlag: "under" | "over" | "ok"`) y nuevos KPIs agregados. Umbral `deviationThreshold = 0.15` como parámetro con valor por defecto.
- La estimación TFS se calcula sobre las tareas hijas activas de las tarjetas atribuidas a la persona, usando los campos ya expuestos por `src/services/tfs.ts` (`originalEstimate`, `remainingWork`). Si el tipo de tarea hija no incluye aún estos campos en `backlogBoard.ts`, se propagan en el mapeo de tarjetas sin cambiar consultas ni permisos.
- `src/lib/personPanel.test.ts`: casos para plan por capacidad con ausencias, plan por TFS con y sin estimación, cálculo de desviación en los tres estados y orden por desviación.
- UI: `PersonKpiCards.tsx` y `PersonPanelTable.tsx` (reutilizando `Progress` y `formatHours` europeo). Sin escrituras a Azure DevOps ni nuevas tablas.
- Nuevas claves de traducción ES/EN para columnas, tarjetas, orden y estados de desviación.
- Verificación: typecheck, lint, tests dirigidos, build y revisión de /team-load en el navegador.
