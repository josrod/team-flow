// Pure ISO week helpers shared by the time booking views and the per-person
// panel. Kept free of any data-layer import so it can be unit-tested.

/** ISO week key (`YYYY-Www`) for an ISO date string. */
export const isoWeekKey = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

/** Monday–Sunday ISO date range for an ISO week key (`YYYY-Www`). */
export const isoWeekRange = (weekKey: string): { from: string; to: string } => {
  const [yearPart, weekPart] = weekKey.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
};

/** ISO week key of the week that precedes the given one. */
export const previousIsoWeekKey = (weekKey: string): string => {
  const { from } = isoWeekRange(weekKey);
  const monday = new Date(`${from}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return isoWeekKey(monday.toISOString().slice(0, 10));
};

/** ISO week key for a date (defaults to today). */
export const currentIsoWeekKey = (now: Date = new Date()): string =>
  isoWeekKey(now.toISOString().slice(0, 10));

/** Number of working days (Mon–Fri) inside an inclusive ISO date range. */
export const workingDaysBetween = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};
