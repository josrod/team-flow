/**
 * Maps backend (Postgres trigger / Supabase) errors related to the
 * `azure_devops_settings.bugs_query_id` validation into clear, user-facing
 * Spanish messages.
 *
 * The trigger `validate_bugs_query_id` raises exceptions with ERRCODE 22023
 * and English messages like:
 *   - "Invalid bugs_query_id: path exceeds 256 characters"
 *   - "Invalid bugs_query_id: path contains reserved characters"
 *   - "Invalid bugs_query_id: path cannot start or end with /"
 *   - "Invalid bugs_query_id: path contains empty segments"
 *
 * Returns `null` when the error is unrelated, so callers can fall back to
 * their generic error handling.
 */

export interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

const GENERIC_BUGS_QUERY_MESSAGE =
  "El 'Query de Bugs' no es válido. Usa un GUID o una ruta de query correcta.";

export const mapBugsQueryIdError = (
  error: unknown,
): string | null => {
  if (!error || typeof error !== "object") return null;
  const err = error as SupabaseLikeError;
  const message = typeof err.message === "string" ? err.message : "";
  const details = typeof err.details === "string" ? err.details : "";
  const haystack = `${message} ${details}`.toLowerCase();

  const mentionsBugsQuery =
    haystack.includes("bugs_query_id") ||
    haystack.includes("bugs query") ||
    haystack.includes("query de bugs");

  if (!mentionsBugsQuery) return null;

  if (haystack.includes("exceeds 256") || haystack.includes("256 characters")) {
    return "La ruta del 'Query de Bugs' no puede superar 256 caracteres.";
  }
  if (haystack.includes("reserved characters")) {
    return "El 'Query de Bugs' contiene caracteres no permitidos (\\, ?, #, %, &).";
  }
  if (haystack.includes("start or end with")) {
    return "La ruta del 'Query de Bugs' no puede empezar ni terminar con '/'.";
  }
  if (haystack.includes("empty segments")) {
    return "La ruta del 'Query de Bugs' contiene segmentos vacíos.";
  }
  return GENERIC_BUGS_QUERY_MESSAGE;
};
