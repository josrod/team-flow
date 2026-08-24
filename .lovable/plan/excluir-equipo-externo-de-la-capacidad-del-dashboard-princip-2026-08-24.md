# Excluir equipo externo de la capacidad del Dashboard principal

## Contexto

- En la base de datos existen tres equipos: `RODAT`, `Processing` y `Externals`.
- El Dashboard principal (`/`) renderiza `AnalyticsPanel` y unas tarjetas por equipo que actualmente incluyen a todos los equipos.
- `AnalyticsPanel.tsx` calcula los KPIs de capacidad, el gráfico de barras por equipo y la tendencia de ausencias usando `teams` y `members` sin filtrar.

## Objetivo

Que el cálculo de capacidad y las tarjetas del Dashboard principal solo consideren a los equipos internos (`RODAT` y `Processing`), excluyendo al equipo externo.

## Plan

1. **Crear utilidad de filtro de equipos internos**
   - Añadir `isInternalTeam(team: Team): boolean` en `src/lib/utils.ts` (o fichero auxiliar).
   - Criterio: el nombre del equipo no contenga `"extern"` (case-insensitive). Esto identifica `Externals` sin depender del `id` generado.

2. **Actualizar `AnalyticsPanel.tsx`**
   - Filtrar `teams` y `members` con `isInternalTeam` antes de calcular métricas.
   - Aplicar el filtro en:
     - KPIs de capacidad (total, disponibles, porcentaje).
     - Gráfico de barras de capacidad por equipo.
     - Tendencia de ausencias (solo contar ausencias de miembros internos).
   - El gráfico de tipos de ausencia ya se basa en las ausencias activas; heredará el filtro si se parte de `internalMembers`.

3. **Actualizar `Index.tsx` (Dashboard principal)**
   - Filtrar las tarjetas de equipo para que solo se muestren `RODAT` y `Processing`.
   - Los widgets de handovers y tareas reasignadas no se tocan, salvo que hereden indirectamente del mismo filtro; la capacidad es la métrica a corregir.

4. **Verificar impacto en tests**
   - Revisar `src/test/team-pulse-dashboard.test.tsx` y tests relacionados con `AnalyticsPanel`.
   - Añadir o ajustar un caso que confirme que un equipo cuyo nombre contenga `Externals` no aparece en el gráfico de capacidad ni en las tarjetas.

5. **Validación**
   - Ejecutar `bun run test` (o el test runner del proyecto) para comprobar que no se rompen los tests existentes.
   - Verificar en el preview que el Dashboard principal muestra solo `RODAT` y `Processing` en capacidad y tarjetas.
