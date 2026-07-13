# Fix: personas que faltan al filtrar por equipo en Tasks

## Diagnóstico
Hoy, en `src/pages/FeaturesPage.tsx`, el equipo de cada tarea se resuelve así:

```ts
const teamIdByAssignee = new Map<string, string>();
members.forEach((m) => map.set(m.name, m.teamId));
// filtro: teamIdByAssignee.get(t.assignee) !== activeTeam
```

El `t.assignee` viene del `AssignedTo.displayName` de TFS. Si difiere (acentos, orden, espacios, o la persona no existe en `members`) el item se cae del filtro por equipo.

## Cambios

### 1. Utilidad de matching robusto — `src/lib/assigneeMatch.ts` (nuevo)
- `normalizeName(s)`: `trim` + `toLowerCase` + `NFD` sin diacríticos + colapso de espacios.
- `buildAssigneeIndex(members)`: devuelve `{ byName, byLogin }` con claves normalizadas. `byLogin` indexa `login_name` normalizado.
- `resolveMember(assigneeName, uniqueName, index)`:
  1. match exacto por nombre normalizado,
  2. match por `login_name` contra `uniqueName` normalizado (parte antes de `@` si aplica),
  3. match invirtiendo orden "Apellido, Nombre" ↔ "Nombre Apellido",
  4. `undefined` si nada matchea.
- Tests unitarios `src/lib/assigneeMatch.test.ts` cubriendo cada caso.

### 2. Propagar `uniqueName` de TFS
- En `src/services/tfs.ts` (`listTfsTasks`, `listTfsFeatures` y tipos `TfsWorkItem`): añadir `assigneeUniqueName?: string` leyendo `fields["System.AssignedTo"].uniqueName`.
- Fallback vacío cuando no venga.

### 3. Usar el matcher en `FeaturesPage.tsx`
- Reemplazar `teamIdByAssignee` por `assigneeIndex = buildAssigneeIndex(members)`.
- En `filteredTasks` usar `resolveMember(t.assignee, t.assigneeUniqueName, assigneeIndex)?.teamId` para el filtro de equipo.
- Igual sustitución en cualquier otro `teamIdByAssignee.get(...)` (agrupación, WIP badges, contadores).

### 4. Panel "Assignees sin equipo"
- Nuevo componente `src/components/UnmatchedAssigneesPanel.tsx`:
  - Calcula `unmatched` = assignees únicos de `tasks` cuyo `resolveMember` devuelve `undefined`, con count de items.
  - Se muestra como `Alert` colapsable arriba de la tabla en `FeaturesPage.tsx`, solo si hay entradas y el usuario es admin (`useAuth().isAdmin`).
  - Cada fila: nombre TFS + uniqueName + count + `Select` de equipo + `Select` de member existente (o botón "Crear miembro").
  - Al confirmar:
    - Si eligió member existente → `UPDATE members SET name = <TFS name>` **no** (rompería otros datos); en su lugar, actualizar `login_name` con el `uniqueName` para que el matcher lo capture.
    - Si eligió "Crear miembro" → `INSERT` en `members` con `name`, `teamId`, `login_name = uniqueName`, role vacío.
  - Toast con resultado; la lista se recomputa al llegar realtime.

### 5. i18n
- Añadir claves en `src/context/LanguageContext.tsx`:
  - `tasks.unmatched.title`, `tasks.unmatched.description`, `tasks.unmatched.assignToTeam`, `tasks.unmatched.linkToMember`, `tasks.unmatched.createMember`, `tasks.unmatched.saved`, `tasks.unmatched.empty`.

## Detalles técnicos
- El matcher es puro y memoizable — se envuelve en `useMemo([members])`.
- No se cambia el schema: reusamos `members.login_name` que ya existe.
- El panel escribe con el cliente Supabase autenticado; las RLS actuales ya permiten al admin `UPDATE`/`INSERT` en `members`.
- Sin cambios en la lógica de estados/filtros existentes; solo se sustituye cómo se resuelve el equipo del assignee.

## Fuera de scope
- Auto-crear miembros silenciosamente (rechazado: preferimos flujo con confirmación en el panel).
- Sincronización periódica con Azure Graph API.
