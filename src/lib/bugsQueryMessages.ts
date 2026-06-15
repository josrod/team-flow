/**
 * Mensajes unificados para la validación de `bugs_query_id` (frontend y
 * backend). Tanto `validateQueryId` (cliente, en `src/lib/tfsValidation.ts`)
 * como `mapBugsQueryIdError` (mapeo de errores del trigger Postgres en
 * `src/lib/supabaseErrorMapping.ts`) devuelven exactamente estos textos
 * para cada caso, de forma que el usuario vea el mismo mensaje sin
 * importar dónde falle la validación.
 */
export const BUGS_QUERY_MESSAGES = {
  tooLong: "La ruta no puede superar 256 caracteres.",
  startOrEndSlash: "La ruta no puede empezar ni terminar con '/'.",
  emptySegments: "La ruta contiene segmentos vacíos (//).",
  reservedChars: "Contiene caracteres no permitidos (\\ ? # % &).",
  invalidChars:
    "Solo se permiten letras, números, espacios, '.', '_', '-' y '/'.",
  generic:
    "El 'Query de Bugs' no es válido. Usa un GUID o una ruta de query correcta.",
} as const;

export type BugsQueryMessageKey = keyof typeof BUGS_QUERY_MESSAGES;
