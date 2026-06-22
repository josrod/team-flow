## Objetivo

Permitir a cada desarrollador marcar la prioridad personal de sus tasks/bugs en la vista de Tareas, combinando un **nivel** (Alta / Media / Baja / Sin prioridad) con un **orden manual** dentro de cada nivel (drag & drop). La prioridad es solo visual — no se escribe en TFS — y se guarda localmente con opción de exportar/importar un fichero JSON.

## Alcance funcional

1. **Nueva columna "Prioridad"** en la tabla de Tareas (`FeaturesPage.tsx`), tanto en vista plana como agrupada.
   - Selector inline con 4 opciones: Alta (rojo), Media (ámbar), Baja (azul), Sin prioridad (gris).
   - Badge con color e icono claro, coherente con `SeverityBadge`.
2. **Reordenación drag & drop** de filas dentro del mismo nivel de prioridad. Al arrastrar entre niveles, cambia el nivel automáticamente.
3. **Ordenación**: cuando el usuario activa "Ordenar por prioridad", las filas se agrupan por nivel (Alta → Baja → Sin prioridad) y, dentro de cada grupo, respetan el orden manual. Se mantiene el orden original como alternativa.
4. **Filtro rápido** opcional por nivel de prioridad (chips encima de la tabla, reutilizando patrón de `TaskTypeFilter`).
5. **Export / Import JSON** desde un menú "Prioridades" en la cabecera de Tareas:
   - Exportar: descarga `prioridades-tareas-YYYY-MM-DD.json` con BOM UTF-8.
   - Importar: valida estructura con Zod y fusiona con las prioridades existentes (estrategia: el fichero sobreescribe las claves que contenga).
   - Botón "Limpiar prioridades" con confirmación.

## Modelo de datos (local)

Clave en `localStorage`: `rosen.taskPriorities.v1`.

```ts
type PriorityLevel = "high" | "medium" | "low" | "none";

interface TaskPriorityEntry {
  level: PriorityLevel;
  rank: number; // posición dentro del nivel, menor = más arriba
  updatedAt: string; // ISO
}

// Mapa: clave = id estable de la task/bug (taskId de TFS)
type TaskPriorityMap = Record<string, TaskPriorityEntry>;
```

Fichero exportado:
```json
{
  "version": 1,
  "exportedAt": "2026-06-22T10:00:00.000Z",
  "priorities": { "12345": { "level": "high", "rank": 0, "updatedAt": "..." } }
}
```

Las prioridades son **por navegador**, no por usuario autenticado (el usuario las puede mover entre dispositivos exportando el JSON). Se aplican a tasks y bugs por igual usando el `taskId` como clave, así sirven para ambos tipos sin duplicar lógica.

## Cambios técnicos

- **`src/lib/taskPriority.ts`** (nuevo): tipos, constantes (`PRIORITY_ORDER`, etiquetas i18n), helpers `loadPriorities`, `savePriorities`, `setPriority`, `reorderWithinLevel`, `exportPriorities`, `importPriorities` (validación Zod), `sortByPriority`.
- **`src/hooks/useTaskPriorities.ts`** (nuevo): hook con estado reactivo sobre `localStorage`, expone `priorities`, `setLevel(id, level)`, `move(id, targetLevel, targetIndex)`, `reset()`, `exportJson()`, `importJson(file)`.
- **`src/components/PriorityBadge.tsx`** (nuevo): badge con color por nivel, usando tokens semánticos de `index.css` (sin colores hardcodeados).
- **`src/components/PrioritySelect.tsx`** (nuevo): popover/select inline con los 4 niveles.
- **`src/components/PriorityMenu.tsx`** (nuevo): dropdown en la cabecera con Exportar / Importar / Limpiar.
- **`src/pages/FeaturesPage.tsx`** (editar):
  - Añadir columna "Prioridad" (180px) justo después de "Iteración" en ambas tablas (plana y agrupada) y en `TaskRowWithHandover` (actualizar `colSpan`).
  - Integrar drag & drop con `@dnd-kit/core` + `@dnd-kit/sortable` (ya estándar para shadcn). Solo activo cuando el orden actual es "Por prioridad".
  - Añadir toggle "Ordenar por prioridad" junto a los filtros existentes.
  - Añadir `<PriorityMenu />` en la barra superior de la página.
- **i18n**: añadir claves en `LanguageContext` para "Prioridad", "Alta", "Media", "Baja", "Sin prioridad", "Ordenar por prioridad", "Exportar prioridades", "Importar prioridades", "Limpiar prioridades", mensajes de toast.
- **Tests** (`src/test/task-priority.test.ts`):
  - `setPriority` actualiza nivel y mantiene rank coherente.
  - `move` reordena correctamente entre y dentro de niveles.
  - `sortByPriority` respeta orden Alta → Media → Baja → Sin prioridad y rank interno.
  - `importPriorities` rechaza JSON inválido con Zod.

## UX y estilo

- Colores de nivel mediante tokens existentes (`--destructive`, `--warning` si existe, `--primary`, `--muted-foreground`). Si falta `--warning`, se añade en `index.css` y `tailwind.config.ts`.
- Drag handle discreto (icono `GripVertical`) en la fila, visible al hover.
- Feedback con `toast` (Sonner) al exportar/importar/limpiar.
- Accesible: el cambio de nivel también se puede hacer por teclado vía el `Select`.

## Alternativas evaluadas (descartadas)

- **Mapear a `Microsoft.VSTS.Common.Priority` de TFS**: existe en tasks y bugs (valores 1–4), pero es compartida por todo el equipo, no personal. Descartada por requisito de "por usuario".
- **Tabla Lovable Cloud `user_task_priority`**: más robusta y multi-dispositivo, descartada por preferencia explícita del usuario por JSON manual.
- **Solo etiqueta sin drag & drop**: más simple, descartada porque pediste "ambas".

## Diagrama

```text
[Tareas page]
  ├── Filtros (tipo, equipo) ── [Ordenar por prioridad ▢] ── [Prioridades ▼ (Export/Import/Clear)]
  └── Tabla
        Tarea │ Tipo │ Asignado │ Estado │ Iteración │ Prioridad │ ⋮
                                                       ▲
                                            Select + DnD handle
```

## Validación

- `bunx vitest run` debe pasar (incluidos nuevos tests).
- Verificar en Playwright: cambiar nivel, arrastrar fila, exportar JSON, recargar y reimportar.
- Confirmar que el orden y prioridades sobreviven a un refresh del navegador.
