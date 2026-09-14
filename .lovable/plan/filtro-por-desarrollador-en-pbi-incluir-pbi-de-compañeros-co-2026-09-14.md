# Filtro por desarrollador en PBI: incluir PBI de compañeros con tareas propias

## Objetivo

En la sección de PBI (Backlog items), al elegir un desarrollador en el filtro "Persona", mostrar:

1. Los PBI asignados a esa persona (comportamiento actual).
2. Además, los PBI asignados a otra persona que contengan al menos una tarea hija asignada al desarrollador seleccionado.

## Comportamiento

- El contador de items refleja el total ampliado.
- En la vista de tablero, las tarjetas que aparecen solo por una tarea hija se muestran igual que las demás, con una etiqueta discreta tipo "Tarea asignada" para que se entienda por qué aparecen.
- La vista "Por persona" ya agrupa por dueño de tarea, así que solo se beneficia del nuevo filtro sin cambios de agrupación.
- Los demás filtros (equipo, tipo, etiqueta, en espera, búsqueda) siguen funcionando igual y se combinan con este.
- El filtro de equipo sigue basándose en el responsable del PBI; no cambia.

## Detalles técnicos

- `src/pages/BacklogItemsPage.tsx`: en el `useMemo` de `filtered`, cambiar la condición de `person` para que acepte coincidencia en `card.assignedTo` o en cualquier `card.children[].assignedTo` (comparación con trim, igual que ahora).
- Las opciones del desplegable `people` se amplían para incluir también nombres de responsables de tareas hijas, ordenados alfabéticamente.
- `src/components/backlog/BacklogCard.tsx` (o el punto donde se pinta la tarjeta): mostrar la etiqueta de "tarea asignada" cuando el PBI aparezca solo por una hija; se pasa como prop opcional desde la página. Texto nuevo en `LanguageContext` (ES/EN).
- Sin cambios en servicios, consultas a TFS ni base de datos.
