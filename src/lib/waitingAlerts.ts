// Pure helpers for proactive alerts on blocked ("waiting") work items and for
// building the copyable weekly status digest.
import { hasWaitingTag } from "@/lib/tasksState";
import {
  extractWaitingDependency,
  groupWaitingItems,
  NO_THEME_KEY,
  UNASSIGNED_KEY,
  type WaitingItem,
} from "@/lib/waitingGroups";

/** Default staleness threshold, in days, before a waiting item raises an alert. */
export const STALE_WAITING_DAYS = 16;

const MS_PER_DAY = 86_400_000;

/** Whole days elapsed between `iso` and `now`; undefined when the date is unusable. */
export const daysSince = (iso: string | undefined, now: Date = new Date()): number | undefined => {
  if (!iso) return undefined;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return undefined;
  const diff = now.getTime() - then.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
};

export interface StaleWaitingItem extends WaitingItem {
  /** Days without changes; undefined when the item has no `changedDate`. */
  staleDays?: number;
  /** External dependency declared through tags, when present. */
  dependency?: string;
}

/**
 * Keeps waiting-tagged items whose last change is older than `thresholdDays`.
 * Items without a `changedDate` are treated as stale too, since their status
 * cannot be confirmed. Sorted by staleness, oldest first.
 */
export const findStaleWaitingItems = (
  items: readonly WaitingItem[],
  thresholdDays: number = STALE_WAITING_DAYS,
  now: Date = new Date(),
): StaleWaitingItem[] => {
  const stale = items
    .filter((it) => hasWaitingTag(it.tags))
    .map((it) => ({
      ...it,
      staleDays: daysSince(it.changedDate, now),
      dependency: extractWaitingDependency(it.tags),
    }))
    .filter((it) => it.staleDays === undefined || it.staleDays >= thresholdDays);

  return stale.sort((a, b) => (b.staleDays ?? Number.MAX_SAFE_INTEGER) - (a.staleDays ?? Number.MAX_SAFE_INTEGER));
};

/** Counts stale items per declared dependency, sorted by volume. */
export const countByDependency = (
  items: readonly StaleWaitingItem[],
  unknownLabel = "Unknown",
): Array<{ dependency: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.dependency?.trim() || unknownLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([dependency, count]) => ({ dependency, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.dependency.localeCompare(b.dependency)));
};

export interface DigestSummary {
  totalWaiting: number;
  developersAffected: number;
  themesAffected: number;
  staleCount: number;
  stale: StaleWaitingItem[];
  dependencies: Array<{ dependency: string; count: number }>;
}

/** Aggregates every number the digest and the alert centre need. */
export const buildDigestSummary = (
  items: readonly WaitingItem[],
  thresholdDays: number = STALE_WAITING_DAYS,
  now: Date = new Date(),
): DigestSummary => {
  const groups = groupWaitingItems(items);
  const stale = findStaleWaitingItems(items, thresholdDays, now);
  return {
    totalWaiting: groups.reduce((acc, g) => acc + g.total, 0),
    developersAffected: groups.length,
    themesAffected: new Set(groups.flatMap((g) => g.themes.map((th) => th.theme))).size,
    staleCount: stale.length,
    stale,
    dependencies: countByDependency(stale),
  };
};

const formatDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

/**
 * Renders the digest as Markdown so it can be pasted straight into Teams or
 * chat. Text is intentionally English-only: it is an outbound status report.
 */
export const buildWeeklyDigestText = (
  summary: DigestSummary,
  options: { generatedAt?: Date; thresholdDays?: number; workItemUrl?: (id: string) => string } = {},
): string => {
  const generatedAt = options.generatedAt ?? new Date();
  const thresholdDays = options.thresholdDays ?? STALE_WAITING_DAYS;
  const lines: string[] = [];

  lines.push(`# Weekly status digest — ${formatDate(generatedAt)}`, "");
  lines.push("## Waiting overview");
  lines.push(`- Waiting items: ${summary.totalWaiting}`);
  lines.push(`- Developers affected: ${summary.developersAffected}`);
  lines.push(`- Themes affected: ${summary.themesAffected}`);
  lines.push(`- Stale (no change in ${thresholdDays}+ days): ${summary.staleCount}`);
  lines.push("");

  lines.push("## Blocked dependencies needing attention");
  if (summary.stale.length === 0) {
    lines.push("- No stale waiting items. Nothing needs chasing this week.");
  } else {
    const byDeveloper = new Map<string, StaleWaitingItem[]>();
    for (const item of summary.stale) {
      const key = item.assignee?.trim() || UNASSIGNED_KEY;
      const bucket = byDeveloper.get(key);
      if (bucket) bucket.push(item);
      else byDeveloper.set(key, [item]);
    }
    for (const [developer, devItems] of byDeveloper) {
      const label = developer === UNASSIGNED_KEY ? "Unassigned" : developer;
      lines.push("", `### ${label} (${devItems.length})`);
      for (const item of devItems) {
        const theme = item.theme && item.theme !== NO_THEME_KEY ? item.theme : "No theme";
        const age = item.staleDays === undefined ? "age unknown" : `${item.staleDays} days without changes`;
        const dependency = item.dependency ? `waiting on ${item.dependency}` : "dependency not declared";
        const url = options.workItemUrl?.(item.id);
        const ref = url ? `[#${item.id}](${url})` : `#${item.id}`;
        lines.push(`- ${ref} ${item.title} — ${theme} — ${dependency} — ${age}`);
      }
    }
  }

  if (summary.dependencies.length > 0) {
    lines.push("", "## Stale items by dependency");
    for (const dep of summary.dependencies) {
      lines.push(`- ${dep.dependency}: ${dep.count}`);
    }
  }

  return lines.join("\n");
};
