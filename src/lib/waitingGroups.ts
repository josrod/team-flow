// Pure helpers to build the "Waiting" board: work items carrying the
// `waiting` tag grouped by developer and, inside each developer, by theme.
import { hasWaitingTag } from "@/lib/tasksState";

export interface WaitingItem {
  id: string;
  title: string;
  state: string;
  type: string;
  assignee?: string;
  /** Theme label (parent feature title, iteration or area leaf). */
  theme: string;
  tags: readonly string[];
  changedDate?: string;
}

/**
 * Tag prefixes used in TFS to declare which external dependency blocks a
 * waiting item, e.g. `waiting:Customer`, `blocked-by:QA`, `dep:Vendor`.
 */
const DEPENDENCY_PREFIXES = ["waiting:", "waiting-", "blocked-by:", "blockedby:", "dep:", "depends-on:"];

/**
 * Extracts the external dependency declared on the item's tags. Returns
 * undefined when no dependency tag exists, so the UI can show it as unknown.
 */
export const extractWaitingDependency = (
  tags: readonly string[] | null | undefined,
): string | undefined => {
  if (!tags) return undefined;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    const lower = trimmed.toLowerCase();
    const prefix = DEPENDENCY_PREFIXES.find((p) => lower.startsWith(p) && trimmed.length > p.length);
    if (!prefix) continue;
    const value = trimmed.slice(prefix.length).trim();
    if (value) return value;
  }
  return undefined;
};

export interface WaitingThemeGroup {
  theme: string;
  items: WaitingItem[];
}

export interface WaitingDeveloperGroup {
  developer: string;
  total: number;
  themes: WaitingThemeGroup[];
}

export const UNASSIGNED_KEY = "__unassigned__";
export const NO_THEME_KEY = "__no_theme__";

/** Extracts the last segment of a TFS path (`A\B\C` -> `C`). */
export const pathLeaf = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  const parts = path.split("\\").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
};

/**
 * Keeps only items tagged as waiting and groups them by developer, then by
 * theme. Both levels are sorted alphabetically; developers with more waiting
 * items come first so the biggest bottlenecks stay on top.
 */
export const groupWaitingItems = (
  items: readonly WaitingItem[],
): WaitingDeveloperGroup[] => {
  const waiting = items.filter((it) => hasWaitingTag(it.tags));
  const byDeveloper = new Map<string, WaitingItem[]>();
  for (const item of waiting) {
    const key = item.assignee?.trim() || UNASSIGNED_KEY;
    const bucket = byDeveloper.get(key);
    if (bucket) bucket.push(item);
    else byDeveloper.set(key, [item]);
  }

  const groups: WaitingDeveloperGroup[] = [];
  for (const [developer, devItems] of byDeveloper) {
    const byTheme = new Map<string, WaitingItem[]>();
    for (const item of devItems) {
      const theme = item.theme?.trim() || NO_THEME_KEY;
      const bucket = byTheme.get(theme);
      if (bucket) bucket.push(item);
      else byTheme.set(theme, [item]);
    }
    const themes: WaitingThemeGroup[] = Array.from(byTheme.entries())
      .map(([theme, themeItems]) => ({
        theme,
        items: [...themeItems].sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => {
        if (a.theme === NO_THEME_KEY) return 1;
        if (b.theme === NO_THEME_KEY) return -1;
        return a.theme.localeCompare(b.theme);
      });
    groups.push({ developer, total: devItems.length, themes });
  }

  return groups.sort((a, b) => {
    if (a.developer === UNASSIGNED_KEY) return 1;
    if (b.developer === UNASSIGNED_KEY) return -1;
    if (b.total !== a.total) return b.total - a.total;
    return a.developer.localeCompare(b.developer);
  });
};

/** Most recent `changedDate` across the given items, or undefined. */
export const latestChangedDate = (
  items: readonly WaitingItem[],
): string | undefined => {
  let latest: string | undefined;
  for (const item of items) {
    if (!item.changedDate) continue;
    if (!latest || item.changedDate > latest) latest = item.changedDate;
  }
  return latest;
};
