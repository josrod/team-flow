

## 🗂️ Team Flow — Gestión de equipos, ausencias y handovers

### Descripción general
Una aplicación limpia y sencilla para visualizar dos equipos de proyecto, saber quién está de vacaciones o de baja, y facilitar el handover de tareas entre compañeros. Los datos se gestionarán localmente (sin backend por ahora), con datos de ejemplo precargados.

---

### 📄 Página principal — Dashboard
- Vista general con **dos paneles**, uno por equipo (nombres personalizables)
- Cada equipo muestra un **resumen rápido**: número de miembros, cuántos están ausentes hoy, próximas ausencias
- Barra de **búsqueda** para encontrar personas rápidamente (necesario dado el tamaño de los equipos 16+)
- Diseño limpio con sidebar de navegación colapsable

---

### 👥 Vista de equipo
- Lista de miembros con **avatar, nombre, rol** y **estado actual** (disponible / vacaciones / baja)
- Indicador visual de color por estado (verde = disponible, amarillo = vacaciones, rojo = baja)
- Al hacer clic en un miembro se abre su **ficha detallada**
- **Filtros** por estado (todos, disponibles, ausentes) para gestionar equipos grandes

---

### 📅 Vista de ausencias (doble vista)
1. **Calendario visual** — Vista tipo timeline/Gantt donde se ven barras horizontales por persona con sus periodos de ausencia a lo largo del mes
2. **Lista de ausencias** — Tarjetas con próximas ausencias ordenadas por fecha, indicando persona, tipo (vacaciones/baja), fechas y duración
- Posibilidad de **alternar entre ambas vistas** con tabs
- Botón para **registrar nueva ausencia** con formulario: persona, tipo, fecha inicio, fecha fin

---

### 🔄 Gestión de temas de trabajo y handover
- Cada miembro tiene asignados **temas de trabajo** con:
  - **Nombre del tema/proyecto**
  - **Descripción** del trabajo actual
  - **Estado** (en progreso, pendiente, bloqueado, completado)
- Cuando un miembro tiene una ausencia programada, se muestra un **botón de "Crear handover"** que permite:
  - Seleccionar el compañero que cubrirá
  - Seleccionar qué temas se transfieren
  - Añadir notas adicionales para el handover
- Panel de **handovers activos** visible en el dashboard

---

### ➕ Gestión de miembros
- Formulario para **añadir/editar/eliminar** miembros del equipo
- Campos: nombre, rol, equipo asignado
- Asignación de temas de trabajo desde la ficha del miembro

---

### 🎨 Diseño y experiencia
- Interfaz minimalista y limpia con colores neutros
- Sidebar con navegación: Dashboard, Equipo 1, Equipo 2, Ausencias, Handovers
- Totalmente responsive para uso en escritorio y móvil
- Datos de ejemplo precargados para probar la app inmediatamente

