# Arreglar filtro por equipo en la página de Tareas

## Problema

En `/tasks`, al seleccionar un equipo (p. ej. RODAT) no pasa nada en la sección "Tareas por persona". La causa está en `src/pages/FeaturesPage.tsx` (líneas 718–729): el filtro por equipo solo se aplica cuando `source === "local"`, y se omite en modo TFS (Azure DevOps) con el comentario *"TFS tasks don't have team mapping"*.

Sin embargo, sí podemos mapear cada tarea TFS al equipo a través de su `assignee` (nombre) → `members` → `teamId`, igual que se hace para `tasksByPerson`.

## Cambio

En `filteredTasks` (en `src/pages/FeaturesPage.tsx`), eliminar la condición `source === "local"` del filtro por equipo para que también aplique en modo TFS:

```text
if (activeTeam !== "all") {
  const owner = members.find((m) => m.name === t.assignee);
  if (!owner || owner.teamId !== activeTeam) return false;
}
```

Esto:
- Excluye tareas cuyo `assignee` no pertenece al equipo seleccionado.
- Excluye tareas sin asignado (o con asignado desconocido) cuando hay un equipo activo, lo que coincide con la expectativa de "ver solo RODAT".

No se tocan otros filtros (persona, búsqueda) ni la lógica de `tasksByPerson`, que ya deriva de `filteredTasks`.

## Verificación

- Cambiar a la pestaña Tareas con source TFS, seleccionar RODAT y confirmar que "Tareas por persona" solo muestra miembros de RODAT.
- Volver a "Todos los equipos" y verificar que se restauran todas las personas.
- Ejecutar la suite de tests existente para descartar regresiones.
