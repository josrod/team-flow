import { useCallback, useEffect, useState } from "react";
import {
  ALL_BUCKET,
  BucketedPriorityMap,
  buildExportPayload,
  loadBuckets,
  moveTo,
  normalizeBucketKey,
  parseImportPayload,
  PriorityLevel,
  saveBuckets,
  setPriorityLevel,
  STORAGE_KEY_V2,
  TaskPriorityMap,
} from "@/lib/taskPriority";

const downloadJson = (filename: string, payload: unknown): void => {
  const json = "\uFEFF" + JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "todos";

export const useTaskPriorities = () => {
  const [buckets, setBuckets] = useState<BucketedPriorityMap>(() => loadBuckets());

  // Listen for cross-tab updates so two open tabs stay in sync.
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_V2) setBuckets(loadBuckets());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const commit = useCallback((next: BucketedPriorityMap) => {
    setBuckets(next);
    saveBuckets(next);
  }, []);

  const mapFor = useCallback(
    (key: string): TaskPriorityMap => buckets[normalizeBucketKey(key)] ?? {},
    [buckets],
  );

  const setLevel = useCallback(
    (key: string, id: string, level: PriorityLevel) => {
      const bk = normalizeBucketKey(key);
      const nextBucket = setPriorityLevel(buckets[bk] ?? {}, id, level);
      commit({ ...buckets, [bk]: nextBucket });
    },
    [buckets, commit],
  );

  const move = useCallback(
    (key: string, id: string, targetLevel: PriorityLevel, targetIndex: number) => {
      const bk = normalizeBucketKey(key);
      const nextBucket = moveTo(buckets[bk] ?? {}, id, targetLevel, targetIndex);
      commit({ ...buckets, [bk]: nextBucket });
    },
    [buckets, commit],
  );

  const reset = useCallback(
    (key: string) => {
      const bk = normalizeBucketKey(key);
      const next = { ...buckets };
      delete next[bk];
      commit(next);
    },
    [buckets, commit],
  );

  const exportJson = useCallback(
    (key: string) => {
      const bk = normalizeBucketKey(key);
      const today = new Date().toISOString().slice(0, 10);
      const label = bk === ALL_BUCKET ? "todos" : slugify(bk);
      downloadJson(
        `prioridades-tareas-${label}-${today}.json`,
        buildExportPayload(buckets[bk] ?? {}),
      );
    },
    [buckets],
  );

  const importJson = useCallback(
    async (key: string, file: File) => {
      const bk = normalizeBucketKey(key);
      const raw = await file.text();
      const incoming = parseImportPayload(raw);
      const merged: TaskPriorityMap = { ...(buckets[bk] ?? {}), ...incoming };
      commit({ ...buckets, [bk]: merged });
    },
    [buckets, commit],
  );

  const countFor = useCallback(
    (key: string): number => Object.keys(buckets[normalizeBucketKey(key)] ?? {}).length,
    [buckets],
  );

  return { buckets, mapFor, setLevel, move, reset, exportJson, importJson, countFor };
};
