## Objetivo

En la página `/tasks` reducir el ruido: mostrar únicamente items realmente accionables.

- Tasks (tipo `Task`): solo estados **Open / New** e **In Progress**.
- Bugs (tipo `Bug`): estados **Open / New** e **In Progress**, y además bugs **cerrados/resueltos en los últimos 10 días** (para mantener visibilidad reciente).

Todo lo demás (Done/Closed/Resolved antiguos, Blocked) queda oculto en esta vista.

## Alcance

Solo la vista Tasks (`view === "tasks"`), sin tocar Features ni Bugs ni Workload. Cambio de presentación/filtrado en `src/pages/FeaturesPage.tsx`. Sin cambios de datos, servicios ni backend.

## Criterio de filtrado

Se aplica dentro del `useMemo` de `filteredTasks` (línea 877), cuando `view === "tasks"`:

```text
esOpenOInProgress = normalizeState(state) ∈ {"active", "pending"}

esBugCerradoReciente =
  tipo == "Bug"
  ∧ normalizeState(state) ∈ {"done", "resolved", "closed"}
  ∧ fechaCierre(t) ≥ hoy − 10 días

fechaCierre(t) = t.closedDate ?? t.changedDate  // ISO string
```

Se mantiene el item si `esOpenOInProgress ∨ esBugCerradoReciente`. Cualquier otro caso se descarta antes de aplicar el resto de filtros (equipo, persona, búsqueda, tipo, exclusión de Product Backlog Item).

Notas:
- La ventana de 10 días se calcula una vez fuera del `filter` (`Date.now() - 10*24*3600*1000`).
- Si el bug no tiene ni `closedDate` ni `changedDate`, no cumple el criterio de "cerrado reciente" y queda oculto.
- Los contadores existentes (`typeCounts`, `stateDistribution`, `tasksByPerson`, badge WIP) siguen funcionando porque se alimentan de `filteredTasks`.

## UI

Añadir bajo el título de la vista Tasks un pequeño texto informativo (i18n) que aclare el criterio, para que el usuario entienda por qué no ve items antiguos:

> "Mostrando tareas abiertas / en curso y bugs cerrados en los últimos 10 días."

Se coloca como línea `text-xs text-muted-foreground` junto al header existente de la sección Tasks, solo cuando `view === "tasks"`.

## i18n

Nueva clave en `src/context/LanguageContext.tsx`:

- `tasksViewFilterHint`
  - ES: "Mostrando tareas abiertas / en curso y bugs cerrados en los últimos 10 días."
  - EN: "Showing open / in progress tasks and bugs closed in the last 10 days."

## Archivos a modificar

- `src/pages/FeaturesPage.tsx` — ajustar `filteredTasks` con el nuevo criterio cuando `view === "tasks"` y renderizar el hint.
- `src/context/LanguageContext.tsx` — clave `tasksViewFilterHint` (ES/EN).

## Verificación

1. Abrir `/tasks`:
   - Tasks con estado Done/Closed no aparecen.
   - Bugs Open / In Progress aparecen.
   - Bugs Closed/Resolved con `closedDate` (o `changedDate` si falta) dentro de los últimos 10 días aparecen; los más antiguos, no.
2. Cambiar idioma → el hint cambia ES/EN.
3. El badge WIP por persona y los contadores por tipo reflejan únicamente los items visibles.
4. Otras vistas (Features, Bugs, Workload) permanecen sin cambios.
