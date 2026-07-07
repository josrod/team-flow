## Objetivo

En la página de Tasks, mostrar junto al nombre de cada desarrollador un pequeño badge con su WIP (Work In Progress): número total de tasks + bugs que están **In Progress** o **New/Open** (todo lo activo no completado/cerrado/resuelto).

## Alcance del cambio

Solo UI de presentación en `src/pages/FeaturesPage.tsx` (vista `tasks`). Sin cambios de datos, servicios ni backend.

## Definición del WIP

Para cada persona del grupo `tasksByPerson` (que ya está calculado y agrupa tasks + bugs filtrados por equipo/persona/búsqueda/tipo):

```
WIP = group.active.length + group.pending.length
```

Esto cubre "In Progress + New/Open" tanto para tasks como para bugs, siguiendo la normalización de estados existente (`normalizeState`). No se cuentan `blocked`, `done`, `resolved` ni `closed`.

## UI

En el header de cada `AccordionItem` de la sección "Tasks por persona" (`src/pages/FeaturesPage.tsx` ~línea 1845), añadir un badge compacto inmediatamente después del nombre de la persona:

- Componente: `<Badge variant="outline">` de shadcn.
- Texto: `WIP · {n}` (con `{n}` = suma definida arriba).
- Estilo: `text-[10px] font-medium` con tono `primary` suave (`border-primary/30 text-primary bg-primary/5`) para diferenciarlo de los badges por estado que ya existen a la derecha.
- Solo se renderiza si `wip > 0`.
- `title` / `aria-label`: "Work in progress: {n} tasks/bugs activos o pendientes" (i18n).

Layout: se coloca inline junto al `<p>` del nombre, en un contenedor flex, para que no rompa el `truncate` del nombre en pantallas estrechas (el badge queda a la derecha del nombre, con `shrink-0`).

## i18n

Añadir dos claves en `src/context/LanguageContext.tsx` (ES y EN):

- `wipBadgeLabel`: "WIP" / "WIP"
- `wipBadgeTooltip`: "{n} tareas/bugs en curso o pendientes" / "{n} tasks/bugs in progress or pending"

## Archivos a modificar

- `src/pages/FeaturesPage.tsx` — añadir cálculo de `wip` por grupo y renderizar el badge en el header del acordeón.
- `src/context/LanguageContext.tsx` — dos claves nuevas.

## Verificación

- Abrir `/tasks`, comprobar que cada persona con items activos/pendientes muestra el badge `WIP · N` junto al nombre.
- Cambiar filtros de estado de tasks y bugs y confirmar que el WIP se recalcula (usa `filteredTasks`).
- Persona sin items abiertos (todo Closed) no muestra el badge.
