## Problema

Al subir `Absent_test.xlsx` (formato ROSEN/Invent) con la pestaña **Genérica** activa, el auto-map elige columnas incorrectas (`Default company code name` → Person, sin columna start/end) y `normalizeType` no reconoce `Working hours`. Resultado: 1050 filas con errores "Member not found / Invalid type / Invalid start / Invalid end".

El fichero ya tiene un parser dedicado (`parseInventAbsentFile`) en la pestaña Invent. La solución elegida es detectar el formato y cambiar de modo automáticamente.

## Cambios

**Archivo único:** `src/components/AbsenceImportDialog.tsx`

1. **Helper de detección** (nuevo, en el mismo archivo):
   - `detectInventLayout(file: File): Promise<boolean>` — reutiliza `validateInventAbsentFile` (ya valida las 4 cabeceras: A=Work date, C=Person, D=Duration, E=Activity kind). Devuelve `true` cuando `validation.ok === true`.

2. **`handleFile` en modo `generic`** (rama `xlsx`/`xls`):
   - Antes de hacer `sheet_to_json` genérico, llamar a `detectInventLayout(file)`.
   - Si es ROSEN:
     - `setMode("invent")`
     - Mostrar toast informativo: `t.importAutoDetectedInvent` ("Formato ROSEN detectado — usando el parser Invent")
     - Ejecutar el mismo flujo que el modo Invent: `parseInventAbsentFile`, pre-fill `loginAssignments` desde `loadLoginMappings`, `setStep("preview")`.
   - Si no, continuar con el flujo genérico actual.

3. **Nuevas claves de traducción** en `src/context/LanguageContext.tsx`:
   - `importAutoDetectedInvent` (EN: "ROSEN format detected — switched to Invent parser", ES: "Formato ROSEN detectado — cambiado al parser Invent").

## Verificación

- Añadir test en `src/test/invent-absent-parser.test.ts` (o nuevo `import-autodetect.test.ts`): validar que `validateInventAbsentFile` devuelve `ok: true` para un buffer con las 4 cabeceras correctas y `ok: false` para uno genérico (e.g. columnas `Name, Type, Start, End`).
- Manual en `/absences`: subir `Absent_test.xlsx` con pestaña Genérica activa → debe saltar toast, cambiar a Invent y mostrar el preview con ausencias parseadas + unmatched (en lugar de "1050 with errors").
- Subir un CSV/XLSX genérico legítimo → debe seguir yendo al paso `mapping` sin cambiar de pestaña.

## Fuera de alcance

- No se toca `inventAbsentParser.ts` ni el store de mapeos.
- No se cambian las reglas de `normalizeType` del modo genérico.
- No se elimina la pestaña Genérica: sigue disponible para CSVs/Excels con otros layouts.
