// Quarter helpers for the Epics roadmap.

export interface QuarterKey {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export const NO_DATE_BUCKET = "no-date" as const;
export type QuarterBucket = string; // "YYYY-Qn" or NO_DATE_BUCKET

export const getQuarterKey = (date: Date): QuarterKey => {
  const q = (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return { year: date.getFullYear(), quarter: q };
};

export const toBucketId = (key: QuarterKey): QuarterBucket =>
  `${key.year}-Q${key.quarter}`;

export const parseBucketId = (id: QuarterBucket): QuarterKey | null => {
  if (id === NO_DATE_BUCKET) return null;
  const m = /^(\d{4})-Q([1-4])$/.exec(id);
  if (!m) return null;
  return { year: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 };
};

export const quarterLabel = (key: QuarterKey): string =>
  `Q${key.quarter} ${key.year}`;

export const quarterRange = (key: QuarterKey): { start: Date; end: Date } => {
  const startMonth = (key.quarter - 1) * 3;
  const start = new Date(key.year, startMonth, 1);
  const end = new Date(key.year, startMonth + 3, 0);
  return { start, end };
};

/** Compare bucket ids chronologically; NO_DATE_BUCKET sorts last. */
export const compareBuckets = (a: QuarterBucket, b: QuarterBucket): number => {
  if (a === b) return 0;
  if (a === NO_DATE_BUCKET) return 1;
  if (b === NO_DATE_BUCKET) return -1;
  const pa = parseBucketId(a);
  const pb = parseBucketId(b);
  if (!pa || !pb) return 0;
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
};

/** Ensure the current quarter + N future quarters are always present. */
export const ensureUpcomingQuarters = (
  buckets: QuarterBucket[],
  now: Date,
  extra = 3,
): QuarterBucket[] => {
  const current = getQuarterKey(now);
  const result = new Set(buckets);
  for (let i = 0; i <= extra; i++) {
    const q = ((current.quarter - 1 + i) % 4) + 1;
    const yearOffset = Math.floor((current.quarter - 1 + i) / 4);
    result.add(toBucketId({ year: current.year + yearOffset, quarter: q as 1 | 2 | 3 | 4 }));
  }
  return Array.from(result).sort(compareBuckets);
};

export const bucketForDate = (dateIso?: string | null): QuarterBucket => {
  if (!dateIso) return NO_DATE_BUCKET;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return NO_DATE_BUCKET;
  return toBucketId(getQuarterKey(d));
};
