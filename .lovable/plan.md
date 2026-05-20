## Diagnóstico

El fichero `Absent_test.xlsx` (hoja "Sheet", 2.939 filas, 12 columnas) tiene esta estructura:

| Col | A | B | C | D | E | F–L |
|---|---|---|---|---|---|---|
| Cabecera | Work date | *(vacío)* | Person | Duration | Activity kind | Default organization, Delivery no, Delivery position, Default plant, Default company code, Default company code name, Support |
| Fila de grupo | `ABlinov ` | — | — | — | — | — |
| Fila de datos | — | 03/04/2026 | ABlinov | 7,6 | Public Holiday | … |

Tipos de actividad presentes: `Public Holiday` (1.391), `Absent` (1.439), `Business Trip` (22), `Business Trip (short)` (16). No aparecen `Vacation`, `Sick Leave`, `Training`, `Working Hours`.

### Qué falla en `src/services/inventAbsentParser.ts` hoy

1. **Índices de columna incorrectos.** El parser lee `r[0]=date, r[1]=login, r[2]=duration, r[3]=kind`. En este fichero los datos están en `r[1]=date, r[2]=login, r[3]=duration, r[4]=kind`. Resultado: ninguna fila se importa (todas serían `skipped` porque `r[0]` está vacío en filas de datos).
2. **`Business Trip (short)` no está mapeado** → se descartaría silenciosamente. Debe tratarse como `work-travel`.
3. El campo "Person" llega con espacios al final en las cabeceras de grupo (`"ABlinov "`); en las filas de datos viene limpio, pero conviene mantener el `.trim()` actual.

### Qué sobra (y se puede ignorar sin cambios)

- Columnas F–L (`Default organization`, `Delivery no/position`, `Default plant`, `Default company code`, `Default company code name`, `Support`) no aportan al modelo de ausencias.
- Las filas de grupo (solo nombre en col A) ya se descartan automáticamente porque no parsean fecha.
- `Public Holiday` sigue excluido (correcto).
- Mapeo de `Absent → sick-leave` se mantiene (confirmado por el usuario).

## Cambios a implementar

**Archivo único:** `src/services/inventAbsentParser.ts`

1. **Reasignar índices de columna** en el bucle de parseo:
   - `workDate = parseCellDate(r[1])`
   - `userLoginName = String(r[2] ?? "").trim()`
   - `duration = Number(r[3])` (mismo manejo de coma decimal)
   - `activityKind = String(r[4] ?? "").trim()`
2. **Añadir mapeos** a `ACTIVITY_TO_TYPE`:
   - `"business trip (short)": "work-travel"`
   - Mantener `"vacation"`, `"sick leave"`, `"absent"`, `"business trip"` por compatibilidad con el formato anterior (Invent).
3. **Mantener** `EXCLUDED_KINDS` (`public holiday`, `training`, `working hours`) y el filtro `duration === 0`.
4. **Mantener** `range: 1` (salta cabecera) y agrupación por persona/día/tipo consecutivo.

## Verificación

- Añadir test unitario en `src/test/` que cargue un buffer mínimo replicando el layout de 12 columnas (cabecera + 1 fila de grupo + 3 filas de datos: una `Public Holiday` excluida, dos `Absent` consecutivas que deben colapsar en un solo rango `sick-leave`, una `Business Trip (short)` como `work-travel`) y aserte el resultado de `parseInventAbsentFile`.
- Ejecutar `bunx vitest run` para confirmar que pasa.
- Confirmar visualmente en `/absences` con el fichero real desde el diálogo de importación.

## Fuera de alcance

- No se toca `AbsenceImportDialog.tsx` (la UI no cambia).
- No se modifica el modelo de datos ni el esquema de validación.
- No se rellenan `loginName` de los miembros automáticamente: si hay logins del fichero sin miembro asociado, seguirán apareciendo en el listado de `unmatched` del diálogo, como ahora.
