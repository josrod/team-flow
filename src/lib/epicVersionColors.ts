// Bounded colour palette for delivery versions in the Epics view.
// Only design-system friendly tones; no free-form hex values so contrast
// stays readable in light and dark mode.
//
// Accessibility: colour is never the only signal. Every palette entry also
// carries a unique geometric symbol and a colour name so colour-blind users
// can tell versions apart from the shape/text alone.

export interface EpicVersionColor {
  key: string;
  /** Solid background (timeline bars, swatches). Dark enough for white text. */
  bar: string;
  /** Badge styling: soft background + readable foreground (AA in both themes). */
  badge: string;
  /** Left accent stripe on roadmap cards. */
  stripe: string;
  /** Unique non-colour marker shown next to the version name. */
  symbol: string;
  /** Human-readable colour name, used in accessible labels and tooltips. */
  colorName: string;
}

export const EPIC_VERSION_COLORS: readonly EpicVersionColor[] = [
  { key: "slate", bar: "bg-slate-600", badge: "bg-slate-500/15 text-slate-800 dark:text-slate-200 border-slate-600/40", stripe: "bg-slate-600", symbol: "●", colorName: "Slate" },
  { key: "blue", bar: "bg-blue-600", badge: "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-600/40", stripe: "bg-blue-600", symbol: "■", colorName: "Blue" },
  { key: "cyan", bar: "bg-cyan-700", badge: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 border-cyan-700/40", stripe: "bg-cyan-700", symbol: "▲", colorName: "Cyan" },
  { key: "teal", bar: "bg-teal-600", badge: "bg-teal-500/15 text-teal-800 dark:text-teal-200 border-teal-600/40", stripe: "bg-teal-600", symbol: "◆", colorName: "Teal" },
  { key: "green", bar: "bg-emerald-600", badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/40", stripe: "bg-emerald-600", symbol: "★", colorName: "Green" },
  { key: "lime", bar: "bg-lime-700", badge: "bg-lime-600/15 text-lime-800 dark:text-lime-200 border-lime-700/40", stripe: "bg-lime-700", symbol: "▼", colorName: "Lime" },
  { key: "amber", bar: "bg-amber-600", badge: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-600/40", stripe: "bg-amber-600", symbol: "◼", colorName: "Amber" },
  { key: "orange", bar: "bg-orange-600", badge: "bg-orange-500/15 text-orange-800 dark:text-orange-200 border-orange-600/40", stripe: "bg-orange-600", symbol: "✦", colorName: "Orange" },
  { key: "rose", bar: "bg-rose-600", badge: "bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-600/40", stripe: "bg-rose-600", symbol: "✚", colorName: "Rose" },
  { key: "violet", bar: "bg-violet-600", badge: "bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-600/40", stripe: "bg-violet-600", symbol: "◐", colorName: "Violet" },
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

/** Accessible text describing a version without relying on colour perception. */
export const epicVersionAccessibleLabel = (versionName: string, colorKey?: string | null): string => {
  const color = resolveEpicVersionColor(colorKey);
  return `${versionName} (${color.colorName} ${color.symbol})`;
};
