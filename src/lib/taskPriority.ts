import { z } from "zod";

// Personal priority for tasks/bugs. Stored locally in the browser; never
// written back to TFS. Each entry combines a coarse level with a fine-grained
// rank used to preserve manual drag & drop order inside the same level.

export const PRIORITY_LEVELS = ["high", "medium", "low", "none"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export interface TaskPriorityEntry {
  level: PriorityLevel;
  rank: number;
  updatedAt: string;
}

export type TaskPriorityMap = Record<string, TaskPriorityEntry>;

// Buckets keyed by developer (e.g. assignee name). A reserved key holds
// priorities used when no developer filter is active.
export type BucketedPriorityMap = Record<string, TaskPriorityMap>;

export const ALL_BUCKET = "__all__";
export const STORAGE_KEY = "rosen.taskPriorities.v1";
export const STORAGE_KEY_V2 = "rosen.taskPriorities.v2";

// Order from highest to lowest visual priority.
export const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

const entrySchema = z.object({
  level: z.enum(PRIORITY_LEVELS),
  rank: z.number().finite(),
  updatedAt: z.string().min(1),
});

const bucketSchema = z.record(z.string().min(1), entrySchema);
const bucketedSchema = z.record(z.string().min(1), bucketSchema);

const fileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().min(1),
  priorities: z.record(z.string().min(1), entrySchema),
});

export type PriorityFile = z.infer<typeof fileSchema>;

export const normalizeBucketKey = (key: string | null | undefined): string => {
  const trimmed = (key ?? "").trim();
  return trimmed.length > 0 ? trimmed : ALL_BUCKET;
};

export const loadPriorities = (): TaskPriorityMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const result = bucketSchema.safeParse(parsed);
    return result.success ? (result.data as TaskPriorityMap) : {};
  } catch {
    return {};
  }
};

export const savePriorities = (map: TaskPriorityMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private mode: silently ignore.
  }
};

export const saveBuckets = (buckets: BucketedPriorityMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(buckets));
  } catch {
    // Quota or private mode: silently ignore.
  }
};

export const loadBuckets = (): BucketedPriorityMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const result = bucketedSchema.safeParse(parsed);
      if (result.success) return result.data as BucketedPriorityMap;
    }
    // One-time migration: lift any existing v1 flat map into the shared bucket.
    const legacy = loadPriorities();
    if (Object.keys(legacy).length > 0) {
      const migrated: BucketedPriorityMap = { [ALL_BUCKET]: legacy };
      saveBuckets(migrated);
      return migrated;
    }
    return {};
  } catch {
    return {};
  }
};

const nowIso = (): string => new Date().toISOString();

const nextRankForLevel = (map: TaskPriorityMap, level: PriorityLevel): number => {
  let max = -1;
  for (const entry of Object.values(map)) {
    if (entry.level === level && entry.rank > max) max = entry.rank;
  }
  return max + 1;
};

export const setPriorityLevel = (
  map: TaskPriorityMap,
  id: string,
  level: PriorityLevel,
): TaskPriorityMap => {
  const next: TaskPriorityMap = { ...map };
  if (level === "none" && !next[id]) return map;
  const rank = nextRankForLevel(next, level);
  next[id] = { level, rank, updatedAt: nowIso() };
  return next;
};

// Move id into targetLevel at the given index (0-based, within that level).
export const moveTo = (
  map: TaskPriorityMap,
  id: string,
  targetLevel: PriorityLevel,
  targetIndex: number,
): TaskPriorityMap => {
  const grouped = new Map<PriorityLevel, string[]>();
  for (const level of PRIORITY_LEVELS) grouped.set(level, []);
  const entries = Object.entries(map)
    .filter(([entryId]) => entryId !== id)
    .sort((a, b) => a[1].rank - b[1].rank);
  for (const [entryId, entry] of entries) grouped.get(entry.level)!.push(entryId);
  const list = grouped.get(targetLevel)!;
  const clamped = Math.max(0, Math.min(targetIndex, list.length));
  list.splice(clamped, 0, id);

  const next: TaskPriorityMap = {};
  const updatedAt = nowIso();
  for (const level of PRIORITY_LEVELS) {
    const items = grouped.get(level)!;
    items.forEach((entryId, index) => {
      const existing = map[entryId];
      next[entryId] = {
        level,
        rank: index,
        updatedAt: entryId === id ? updatedAt : existing?.updatedAt ?? updatedAt,
      };
    });
  }
  return next;
};

export const clearPriorities = (): TaskPriorityMap => ({});

export interface SortableItem {
  id: string;
}

export const sortByPriority = <T extends SortableItem>(
  items: T[],
  map: TaskPriorityMap,
): T[] => {
  return [...items].sort((a, b) => {
    const aEntry = map[a.id];
    const bEntry = map[b.id];
    const aLevel = aEntry?.level ?? "medium";
    const bLevel = bEntry?.level ?? "medium";
    if (aLevel !== bLevel) return PRIORITY_ORDER[aLevel] - PRIORITY_ORDER[bLevel];
    const aRank = aEntry?.rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = bEntry?.rank ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
};

export const buildExportPayload = (map: TaskPriorityMap): PriorityFile => ({
  version: 1,
  exportedAt: nowIso(),
  priorities: map,
});

export const parseImportPayload = (raw: string): TaskPriorityMap => {
  const parsed: unknown = JSON.parse(raw);
  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Invalid priority file format");
  }
  return result.data.priorities as TaskPriorityMap;
};

export const mergePriorities = (
  base: TaskPriorityMap,
  incoming: TaskPriorityMap,
): TaskPriorityMap => ({ ...base, ...incoming });
