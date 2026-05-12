Aquí tienes la propuesta para la nueva sección de **Carga de Trabajo y Disponibilidad** centrada en el equipo Rodat. He incluido tus preferencias sobre medir por semanas calendario y comparar contra una capacidad máxima.

### 1. Ubicación y Estructura Visual
- **Nueva Pestaña/Vista**: Añadiremos una pestaña llamada "Carga & Capacidad" dentro de la vista del equipo (o una página dedicada).
- **Matriz de Capacidad**: Una tabla interactiva donde las **filas** son los miembros del equipo y las **columnas** son las próximas 4 o 6 semanas calendario.
- **Celdas de Ocupación**: Cada celda mostrará una barra de progreso que indica el porcentaje de ocupación (`Esfuerzo Asignado / Capacidad Disponible`).
  - 🟢 **Verde (< 80%)**: Carga saludable.
  - 🟡 **Amarillo (80% - 100%)**: Carga óptima / Al límite.
  - 🔴 **Rojo (> 100%)**: Sobreasignación (Cuello de botella).
  - 🔘 **Gris / Rayado**: Semanas con capacidad reducida por vacaciones/bajas.
- **Detalle de Tareas**: Al hacer clic en la celda de una persona en una semana específica, se abrirá un panel lateral (o modal) listando las tareas exactas que causan esa carga, mostrando su *due date* o *effort*.

### 2. Cálculo de Capacidad y Ausencias
- Definiremos una **Capacidad Base** (por ejemplo, 40 horas o 10 puntos por semana por persona). Permitiremos ajustar este valor base si es necesario.
- Usaremos el sistema de **Ausencias** existente (`AppContext`) para reducir dinámicamente la capacidad. Si alguien tiene 2 días de vacaciones en una semana, su capacidad disponible para esa semana bajará automáticamente un 40%.

### 3. Origen de los Datos (Doble Enfoque)
Como solicitaste, dejaremos preparadas ambas vías de obtención de datos para que podamos decidir o usar una combinación:
- **Vía TFS/Azure DevOps**: Modificaremos la consulta actual (WIQL) en `src/services/tfs.ts` para extraer los campos de `Microsoft.VSTS.Scheduling.Effort`, `OriginalEstimate` y `RemainingWork` de las tareas asignadas.
- **Vía API Interna (Due Date)**: Crearemos un servicio simulado (*mock*) preparado para hacer la llamada a la API interna enviando los IDs de las tareas, que devolverá la fecha de entrega (`dueDate`).
- El cálculo de carga distribuirá el "Effort" de la tarea en la semana correspondiente a su "Due Date" (o distribuido a lo largo de las semanas si no hay fecha exacta).

### Siguientes Pasos
Para proceder con la implementación técnica, me encargaré de:
1. Crear el componente visual de la **Matriz de Capacidad** (`WorkloadMatrix.tsx`).
2. Actualizar el cliente de TFS (`tfs.ts`) para incluir los campos de esfuerzo.
3. Crear el servicio base para la **API interna** de fechas de entrega.
4. Conectar la lógica de ausencias para calcular la capacidad real por semana.

¿Te parece bien este plan? Si estás de acuerdo, presiona "Implement plan" para empezar a codificar.