/**
 * Unified messages for validating `bugs_query_id` (frontend and backend).
 * Both `validateQueryId` (client, in `src/lib/tfsValidation.ts`) and
 * `mapBugsQueryIdError` (Postgres trigger error mapping in
 * `src/lib/supabaseErrorMapping.ts`) return these exact strings for each
 * case so the user sees the same message regardless of where validation
 * fails.
 */
export const BUGS_QUERY_MESSAGES = {
  tooLong: "The path cannot exceed 256 characters.",
  startOrEndSlash: "The path cannot start or end with '/'.",
  emptySegments: "The path contains empty segments (//).",
  reservedChars: "Contains disallowed characters (\\ ? # % &).",
  invalidChars:
    "Only letters, numbers, spaces, '.', '_', '-' and '/' are allowed.",
  generic:
    "The 'Bugs query' is not valid. Use a GUID or a correct query path.",
} as const;

export type BugsQueryMessageKey = keyof typeof BUGS_QUERY_MESSAGES;
