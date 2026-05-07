## Objetivo

Reorganizar `src/pages/FeaturesPage.tsx` para que el contenido quede dividido claramente en dos bloques verticales, cada uno con sus propias estadísticas y su propio listado:

1. **Sección Features** — KPIs específicos de features + tarjetas de features.
2. **Sección Tareas** — KPIs específicos de tareas + listado por persona (acordeón) mostrando únicamente tareas abiertas o en progreso.

No se cambian las consultas a Azure DevOps ni la lógica de carga/filtros: solo se reestructura la presentación.

## Cambios por sección

### 1. KPI strip actual (`Features / Tareas / En ejecución / Completadas`)
- Se elimina como bloque único.
- Se reparten en dos sub-strips:
  - **Stats de Features**: total features, features activas, features completadas, % de avance medio (suma de doneCount / suma de taskCount).
  - **Stats de Tareas**: total tareas, abiertas (pending), en progreso (active), bloqueadas, completadas.

### 2. Sección Features (primera)
Cabecera con título "Features" + descripción + stats de features.
Debajo, las tarjetas actuales (`filteredFeatures.map(...)`) tal cual están hoy. Se mantienen los gráficos de "Distribución por estado" y "Carga por persona" ligados a tareas — se mueven a la sección de Tareas porque ahí tiene más sentido.

### 3. Sección Tareas (segunda)
Cabecera con título "Tareas" + descripción + stats de tareas.
Debajo:
- Los dos gráficos actuales (`Distribución por estado` y `Carga por persona`).
- **Nuevo bloque "Tareas por persona"**: usa el componente `Accordion` de shadcn (`@/components/ui/accordion`).
  - Solo se incluyen tareas con estado normalizado `active` (en progreso) o `pending` (abierta). Se excluyen `done` y `blocked` salvo que se filtre por persona específica (en cuyo caso se muestran todas para no perder contexto). Mantengo simple: solo `active` + `pending`.
  - Una entrada por persona (basada en `filteredTasks`), ordenadas por número de tareas descendente.
  - El trigger del acordeón muestra: avatar/iniciales, nombre, total, contador de "En progreso" (chip azul) y "Pendientes" (chip ámbar).
  - El contenido del acordeón es una tabla compacta (igual que la actual) con: #, Título, Tipo, Estado, acciones (abrir/copiar enlace en modo TFS).
  - Personas con ≥1 tarea en progreso se abren por defecto; el resto colapsadas. Soporta múltiple abierto a la vez.
  - "Sin asignar" se trata como una persona más, al final.
- Se mantiene la tabla plana actual oculta por defecto bajo un toggle "Ver listado plano" para usuarios que prefieran exportar/escanear linealmente. Mantener controles existentes (búsqueda, combobox de persona, switch "confirmar cambios", tabs de equipo) encima del acordeón, intactos.

### 4. Restos sin cambios
- Header de la página, badges de fuente de datos, banner de error, "Alcance efectivo" y panel de auditoría: se quedan donde están (arriba del todo).
- Filtros (search, person combobox, switch manual-apply, tabs de equipo) se mueven a la cabecera de la sección Tareas, ya que son los que afectan al listado por persona.

## Detalles técnicos

- Importar `Accordion, AccordionItem, AccordionTrigger, AccordionContent` desde `@/components/ui/accordion`.
- Crear dos `useMemo`:
  - `featureStats` derivado de `filteredFeatures`.
  - `tasksByPerson` derivado de `filteredTasks` filtrando por `normalizeState(t.state) ∈ {active, pending}`, agrupando por `t.assignee || "Sin asignar"`, devolviendo `{ person, active: TfsTask[], pending: TfsTask[], total }` ordenado por total desc.
- `defaultValue` del `Accordion` (en modo `type="multiple"`) = personas con `active.length > 0`.
- Reusar `stateColorVar` y `stateLabel` para los chips.
- Mantener el límite de 100 tareas: aplicarlo dentro de cada grupo del acordeón si total > 100, mostrando "Mostrando 100 de N — afina filtros".
- Sin cambios en rutas, tipos ni lógica de carga.

## Archivos afectados

- `src/pages/FeaturesPage.tsx` — única edición.

No se requieren cambios de base de datos, traducciones ni dependencias nuevas.