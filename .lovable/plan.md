## Objetivo

Permitir importar ausencias desde el archivo JSON del export global de la app, sin tocar el resto de datos. Útil para recuperar sólo las ausencias desde un backup.

## UX

En el diálogo "Importar ausencias" se añade una tercera pestaña **JSON** junto a *Genérico* e *Invent*.

1. Zona de drop acepta `.json`.
2. Al soltar el archivo se valida con el mismo esquema que la importación global (`importDataSchema`). Errores de formato se listan por campo (ruta + mensaje) en el panel de errores ya existente.
3. Si el JSON no contiene ausencias, mensaje: "El archivo no contiene ausencias".
4. Paso de preview con tabla:
   - Nombre del miembro (resuelto), tipo, fecha inicio, fecha fin, estado.
   - Estado: **OK**, **Miembro no encontrado**, **Duplicada** (ya existe).
   - Contadores arriba: importables / duplicadas / sin miembro.
5. Botón **Importar**: crea sólo las ausencias nuevas y válidas. Toast con conteo y callback `onImported` con el mismo shape actual.

## Resolución de miembros

Para cada ausencia del JSON:

1. Match por `memberId` exacto contra `members` del contexto.
2. Fallback: si el JSON incluye `members[]`, se busca ese id ahí para obtener el `name` y se hace match case-insensitive por nombre contra los miembros actuales.
3. Si no hay match → fila marcada "Miembro no encontrado" (no se importa).

## Detección de duplicados

Una ausencia se considera duplicada si ya existe una con el mismo `memberId + type + startDate + endDate`. Se cuenta pero no se importa.

## Cambios técnicos

- `src/components/AbsenceImportDialog.tsx`
  - `type Mode = "generic" | "invent" | "json"`.
  - Nueva pestaña en el `Tabs` existente y textos de dropzone.
  - Nuevo handler `handleJsonFile(file)` que hace `file.text()` → `previewImportJson` (ya existe en `src/lib/validation.ts`), luego resuelve miembros y duplicados.
  - Nuevo estado `jsonResult` y bloque de preview JSX para `mode === "json"`.
  - Usar `absences` del `useApp()` (ya disponible) para el chequeo de duplicados.
  - Extender `openFilePicker` para aceptar `.json` cuando `mode === "json"`.
- `src/context/LanguageContext.tsx`
  - Nuevas claves ES/EN: `importModeJson`, `importJsonDropzone`, `importJsonFormats`, `importJsonNoAbsences`, `importJsonMemberNotFound`, `importJsonDuplicate`, `importJsonSummary`, `importJsonStatusOk`.

## Fuera de alcance

- No se modifica la importación global de JSON (sigue reemplazando todo el estado, sólo admin).
- No se borran ni actualizan ausencias existentes desde este flujo — sólo se añaden las nuevas.
