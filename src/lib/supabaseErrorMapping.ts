/**
 * Maps backend (Postgres trigger / Supabase) errors related to the
 * `azure_devops_settings.bugs_query_id` validation into the same Spanish
 * messages that the frontend `validateQueryId` returns, so the user sees
 * a single, unified text per failure mode.
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
import { BUGS_QUERY_MESSAGES } from "@/lib/bugsQueryMessages";

export interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

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
    return BUGS_QUERY_MESSAGES.tooLong;
  }
  if (haystack.includes("reserved characters")) {
    return BUGS_QUERY_MESSAGES.reservedChars;
  }
  if (haystack.includes("start or end with")) {
    return BUGS_QUERY_MESSAGES.startOrEndSlash;
  }
  if (haystack.includes("empty segments")) {
    return BUGS_QUERY_MESSAGES.emptySegments;
  }
  return BUGS_QUERY_MESSAGES.generic;
};

type Lang = "es" | "en";

const CODE_MESSAGES: Record<string, { es: string; en: string }> = {
  "42501": {
    es: "Permiso denegado. Tu usuario no puede realizar esta acción (necesita rol admin o iniciar sesión).",
    en: "Permission denied. Your account cannot perform this action (admin role or sign-in required).",
  },
  "42P01": {
    es: "La tabla referenciada no existe en la base de datos.",
    en: "The referenced table does not exist in the database.",
  },
  "23505": {
    es: "Ya existe un registro con esos datos (violación de unicidad).",
    en: "A record with those values already exists (unique constraint violation).",
  },
  "23503": {
    es: "Referencia inválida: el registro apunta a otro que no existe (clave foránea).",
    en: "Invalid reference: the record points to another that does not exist (foreign key).",
  },
  "23502": {
    es: "Falta un campo obligatorio.",
    en: "A required field is missing.",
  },
  "23514": {
    es: "Un valor no cumple las reglas de validación (check constraint).",
    en: "A value violates a validation rule (check constraint).",
  },
  "22P02": {
    es: "Formato de dato inválido (por ejemplo, un UUID o número mal formado).",
    en: "Invalid data format (for example, a malformed UUID or number).",
  },
  "22023": {
    es: "Valor fuera del formato permitido.",
    en: "Value is outside the allowed format.",
  },
  "PGRST301": {
    es: "Fila bloqueada por las políticas de seguridad (RLS).",
    en: "Row blocked by row-level security policies (RLS).",
  },
  "PGRST116": {
    es: "No se encontró el registro esperado.",
    en: "The expected record was not found.",
  },
};

/**
 * Produces a user-facing error message from anything thrown by supabase-js
 * or by fetch. Combines a friendly translation for the Postgres code (when
 * available) with the raw `message`, `details` and `hint` so the user can
 * see the exact cause without a stack trace.
 */
export function describeSupabaseError(err: unknown, lang: Lang = "es"): string {
  if (err == null) {
    return lang === "es" ? "Error desconocido" : "Unknown error";
  }
  if (typeof err === "string") return err;
  if (err instanceof Error && !("code" in err)) {
    return err.message;
  }
  const e = err as SupabaseLikeError & { status?: number | string };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  const details = typeof e.details === "string" && e.details ? e.details : "";
  const hint = typeof e.hint === "string" && e.hint ? e.hint : "";

  // RLS violation surfaces as generic PG error with a specific message rather
  // than a stable code, catch it explicitly.
  const rls =
    /row-level security|violates row-level security policy/i.test(message);
  if (rls) {
    return lang === "es"
      ? `Bloqueado por las políticas de seguridad (RLS). ${message}`
      : `Blocked by row-level security policies (RLS). ${message}`;
  }

  const mapped = CODE_MESSAGES[code];
  const parts: string[] = [];
  if (mapped) parts.push(mapped[lang]);
  if (message && (!mapped || !message.includes(mapped[lang]))) parts.push(message);
  if (details) parts.push(`${lang === "es" ? "Detalle" : "Detail"}: ${details}`);
  if (hint) parts.push(`${lang === "es" ? "Sugerencia" : "Hint"}: ${hint}`);
  if (code) parts.push(`(${code})`);

  const out = parts.join(" — ").trim();
  return out || (lang === "es" ? "Error desconocido" : "Unknown error");
}

