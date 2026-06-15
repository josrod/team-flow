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
