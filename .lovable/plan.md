# Versiones de entrega con color en la vista de Épicas

Permitir que el admin defina versiones de entrega (por ejemplo "2026.1", "R7") con un color, las asigne a cada épica desde la propia vista, y que todo el equipo vea ese color en el roadmap, el timeline y la lista, con filtro por versión.

## Qué se construye

**1. Catálogo de versiones (solo admin)**
- Panel "Versiones de entrega" dentro de la vista de Épicas, visible para todos pero editable solo por admin.
- Crear, renombrar, reordenar y eliminar versiones.
- Color elegido de una paleta acotada (10 tonos del sistema de diseño, compatibles con modo claro y oscuro). Sin colores libres en hex, para mantener contraste y coherencia visual.

**2. Asignación por épica (solo admin)**
- En la tabla de lista: columna "Versión" con un selector desplegable.
- En la tarjeta del roadmap y en el panel de detalle de la épica: mismo selector.
- Opción "Sin versión" para quitar la asignación.
- Los cambios se guardan al instante y se reflejan para cualquier visitante.

**3. Visualización**
- Tarjetas del roadmap: franja de color a la izquierda de la tarjeta más un badge con el nombre de la versión.
- Timeline / Gantt: la barra de cada épica se pinta con el color de su versión (gris neutro si no tiene).
- Tabla de lista: badge de color en la nueva columna "Versión".
- Leyenda de versiones sobre el roadmap con el conteo de épicas por versión.

**4. Filtro**
- Filtro multi-selección por versión junto al filtro de tags existente, con opción "Sin versión".
- Se guarda en la URL (`?versions=...`) igual que el filtro de tags, para poder compartir el enlace.

## Detalles técnicos

Base de datos (dos tablas nuevas):
- `epic_versions`: nombre, clave de color, orden.
- `epic_version_assignments`: id de la épica en Azure DevOps (texto) y versión asignada, con restricción única por épica.
- Lectura pública (la vista de Épicas es accesible sin iniciar sesión en la intranet); escritura solo para admin mediante `has_role(auth.uid(), 'admin')`. Se incluyen los GRANT correspondientes y triggers de `updated_at`.

Frontend:
- Nuevo servicio `src/services/epicVersions.ts` con las llamadas de lectura/escritura (nada de `fetch` en componentes).
- Nuevo `src/lib/epicVersionColors.ts` con la paleta y el mapeo clave de color a clases Tailwind por token.
- Nuevo componente `src/components/EpicVersionManager.tsx` (catálogo) y `EpicVersionSelect.tsx` (asignación).
- Cambios en `src/pages/EpicsPage.tsx` (columna, filtro, leyenda, colores en roadmap y timeline) y `src/components/EpicDetailDrawer.tsx`.
- Nuevas claves de traducción en `src/context/LanguageContext.tsx` (español e inglés).
- Tests unitarios para el mapeo de colores y para el filtrado por versión.
