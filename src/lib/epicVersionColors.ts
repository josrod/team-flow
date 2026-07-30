// Bounded colour palette for delivery versions in the Epics view.
// Only design-system friendly tones; no free-form hex values so contrast
// stays readable in light and dark mode.

export interface EpicVersionColor {
  key: string;
  /** Solid background (timeline bars, swatches). */
  bar: string;
  /** Badge styling: soft background + readable foreground. */
  badge: string;
  /** Left accent stripe on roadmap cards. */
  stripe: string;
}

export const EPIC_VERSION_COLORS: readonly EpicVersionColor[] = [
  { key: "slate", bar: "bg-slate-500", badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30", stripe: "bg-slate-500" },
  { key: "blue", bar: "bg-blue-500", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30", stripe: "bg-blue-500" },
  { key: "cyan", bar: "bg-cyan-500", badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30", stripe: "bg-cyan-500" },
  { key: "teal", bar: "bg-teal-500", badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30", stripe: "bg-teal-500" },
  { key: "green", bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", stripe: "bg-emerald-500" },
  { key: "lime", bar: "bg-lime-500", badge: "bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30", stripe: "bg-lime-500" },
  { key: "amber", bar: "bg-amber-500", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", stripe: "bg-amber-500" },
  { key: "orange", bar: "bg-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30", stripe: "bg-orange-500" },
  { key: "rose", bar: "bg-rose-500", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", stripe: "bg-rose-500" },
  { key: "violet", bar: "bg-violet-500", badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30", stripe: "bg-violet-500" },
] as const;

export const DEFAULT_EPIC_VERSION_COLOR_KEY = "slate";

const FALLBACK = EPIC_VERSION_COLORS[0];

/** Resolve a stored colour key, falling back to the neutral tone. */
export const resolveEpicVersionColor = (key?: string | null): EpicVersionColor =>
  EPIC_VERSION_COLORS.find((c) => c.key === key) ?? FALLBACK;

/** Pick the next unused colour when creating a version. */
export const nextEpicVersionColorKey = (usedKeys: readonly string[]): string => {
  const used = new Set(usedKeys);
  const free = EPIC_VERSION_COLORS.find((c) => !used.has(c.key));
  return (free ?? EPIC_VERSION_COLORS[usedKeys.length % EPIC_VERSION_COLORS.length]).key;
};
