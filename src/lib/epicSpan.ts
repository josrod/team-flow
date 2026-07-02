import type { TfsEpic } from "@/services/tfs";
import {
  NO_DATE_BUCKET,
  bucketForDate,
  compareBuckets,
  parseBucketId,
  quarterRange,
  type QuarterBucket,
} from "@/lib/quarters";

/**
 * Returns the list of quarter buckets an Epic overlaps within the visible
 * range. When both start and target dates are missing the Epic maps to the
 * NO_DATE_BUCKET. When only one bound is present we anchor the missing side
 * to that same date so single-date Epics still land on a quarter.
 */
export const getEpicQuarterSpan = (
  epic: Pick<TfsEpic, "startDate" | "targetDate">,
  visibleBuckets: QuarterBucket[],
): QuarterBucket[] => {
  const { startDate, targetDate } = epic;
  if (!startDate && !targetDate) return [NO_DATE_BUCKET];

  const start = new Date(startDate ?? targetDate!);
  const end = new Date(targetDate ?? startDate!);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [NO_DATE_BUCKET];
  }

  const [from, to] = start <= end ? [start, end] : [end, start];

  const quarters: QuarterBucket[] = [];
  const seen = new Set<QuarterBucket>();

  // Direct bucket for the boundaries — guarantees coverage even when the
  // visible range does not include them yet.
  for (const iso of [from.toISOString(), to.toISOString()]) {
    const b = bucketForDate(iso);
    if (!seen.has(b)) {
      seen.add(b);
      quarters.push(b);
    }
  }

  // Any visible bucket whose range intersects [from, to] must be included.
  for (const bucket of visibleBuckets) {
    if (seen.has(bucket)) continue;
    const parsed = parseBucketId(bucket);
    if (!parsed) continue;
    const { start: qStart, end: qEnd } = quarterRange(parsed);
    if (qStart <= to && qEnd >= from) {
      seen.add(bucket);
      quarters.push(bucket);
    }
  }

  return quarters.sort(compareBuckets);
};
