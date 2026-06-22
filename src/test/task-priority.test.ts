import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_BUCKET,
  buildExportPayload,
  loadBuckets,
  moveTo,
  normalizeBucketKey,
  parseImportPayload,
  saveBuckets,
  setPriorityLevel,
  sortByPriority,
  STORAGE_KEY,
  STORAGE_KEY_V2,
  TaskPriorityMap,
} from "@/lib/taskPriority";

describe("taskPriority", () => {
  it("setPriorityLevel assigns level with incremental rank", () => {
    const a = setPriorityLevel({}, "1", "high");
    const b = setPriorityLevel(a, "2", "high");
    expect(a["1"].level).toBe("high");
    expect(a["1"].rank).toBe(0);
    expect(b["2"].rank).toBe(1);
  });

  it("moveTo reorders within and across levels", () => {
    let map: TaskPriorityMap = {};
    map = setPriorityLevel(map, "1", "high");
    map = setPriorityLevel(map, "2", "high");
    map = setPriorityLevel(map, "3", "medium");
    // Move "2" to top of high
    map = moveTo(map, "2", "high", 0);
    expect(map["2"].rank).toBe(0);
    expect(map["1"].rank).toBe(1);
    // Move "1" to medium at position 0
    map = moveTo(map, "1", "medium", 0);
    expect(map["1"].level).toBe("medium");
    expect(map["1"].rank).toBe(0);
    expect(map["3"].rank).toBe(1);
  });

  it("sortByPriority orders by level then rank, unprioritised default to medium", () => {
    let map: TaskPriorityMap = {};
    map = setPriorityLevel(map, "a", "low");
    map = setPriorityLevel(map, "b", "high");
    map = setPriorityLevel(map, "c", "medium");
    const items = [{ id: "x" }, { id: "a" }, { id: "b" }, { id: "c" }];
    const sorted = sortByPriority(items, map).map((i) => i.id);
    // x defaults to medium (same as c) but with no rank -> pushed to end of medium
    expect(sorted).toEqual(["b", "c", "x", "a"]);
  });

  it("parseImportPayload rejects invalid JSON", () => {
    expect(() => parseImportPayload("{}")).toThrow();
    expect(() => parseImportPayload(JSON.stringify({ version: 2, priorities: {} }))).toThrow();
  });

  it("buildExportPayload + parseImportPayload roundtrip", () => {
    let map: TaskPriorityMap = {};
    map = setPriorityLevel(map, "1", "high");
    const payload = buildExportPayload(map);
    const parsed = parseImportPayload(JSON.stringify(payload));
    expect(parsed["1"].level).toBe("high");
  });
});

describe("taskPriority buckets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizeBucketKey falls back to shared bucket when empty", () => {
    expect(normalizeBucketKey("")).toBe(ALL_BUCKET);
    expect(normalizeBucketKey(null)).toBe(ALL_BUCKET);
    expect(normalizeBucketKey("  Jane Doe  ")).toBe("Jane Doe");
  });

  it("loadBuckets migrates legacy v1 flat map into shared bucket", () => {
    const legacy: TaskPriorityMap = { "1": { level: "high", rank: 0, updatedAt: "x" } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const buckets = loadBuckets();
    expect(buckets[ALL_BUCKET]?.["1"]?.level).toBe("high");
    expect(localStorage.getItem(STORAGE_KEY_V2)).toBeTruthy();
  });

  it("keeps independent orders for different developer buckets", () => {
    const a = setPriorityLevel({}, "1", "high");
    const b = setPriorityLevel({}, "1", "low");
    saveBuckets({ Alice: a, Bob: b });
    const loaded = loadBuckets();
    expect(loaded.Alice["1"].level).toBe("high");
    expect(loaded.Bob["1"].level).toBe("low");
  });
});
