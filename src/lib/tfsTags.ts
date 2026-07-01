// Helpers for the ";"-separated tags field returned by Azure DevOps / TFS.

export const parseTfsTags = (raw?: string | null): string[] => {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Case-insensitive intersection check.
 * When `allowed` is empty, everything matches (no filter configured).
 */
export const matchesAnyTag = (tags: string[], allowed: string[]): boolean => {
  if (!allowed || allowed.length === 0) return true;
  if (!tags || tags.length === 0) return false;
  const normalized = new Set(allowed.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (normalized.size === 0) return true;
  return tags.some((t) => normalized.has(t.trim().toLowerCase()));
};

export const uniqueTags = (items: { tags: string[] }[]): string[] => {
  const set = new Set<string>();
  items.forEach((it) => it.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};
