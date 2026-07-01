/**
 * Parse the `?tags=` URL parameter into a clean, deduplicated string list.
 * Handles: null/empty, whitespace-only, extra commas, duplicate entries.
 */
export const parseTagsParam = (raw: string | null): string[] => {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

/**
 * Filter selected tags down to those present in the available set
 * (case-insensitive). Returns the original array reference when nothing
 * changes so React can bail out of state updates.
 */
export const pruneUnknownTags = (
  selected: readonly string[],
  available: readonly string[],
): string[] => {
  if (selected.length === 0) return selected as string[];
  const availableSet = new Set(available.map((t) => t.toLowerCase()));
  const next = selected.filter((t) => availableSet.has(t.toLowerCase()));
  if (next.length === selected.length) return selected as string[];
  return next;
};

export const serializeTagsParam = (tags: readonly string[]): string =>
  tags.join(",");
