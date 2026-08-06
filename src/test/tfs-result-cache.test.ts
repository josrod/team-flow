import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTfsCacheKey,
  clearTfsResultCache,
  readTfsCache,
  withTfsCache,
  writeTfsCache,
} from "@/services/tfsResultCache";

describe("TFS result cache", () => {
  beforeEach(() => {
    clearTfsResultCache();
  });

  it("serves the cached value within the TTL and refetches after it expires", () => {
    writeTfsCache("k", { items: [1] }, 1000);
    expect(readTfsCache<{ items: number[] }>("k")).toEqual({ items: [1] });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2000);
    expect(readTfsCache("k")).toBeNull();
    vi.useRealTimers();
  });

  it("coalesces concurrent calls sharing the same key", async () => {
    const fetcher = vi.fn(async () => ({ items: ["a"] }));
    const key = buildTfsCacheKey("tasks", ["conn", []]);
    const [first, second] = await Promise.all([
      withTfsCache(key, fetcher),
      withTfsCache(key, fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("does not cache failed results", async () => {
    const key = buildTfsCacheKey("bugs", ["conn"]);
    const failing = vi.fn(async () => ({ items: [], error: { message: "boom" } }));
    await withTfsCache(key, failing, { isCacheable: (res) => !res.error });
    await withTfsCache(key, failing, { isCacheable: (res) => !res.error });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache when forceRefresh is set", async () => {
    const key = buildTfsCacheKey("epics", ["conn"]);
    const fetcher = vi.fn(async () => ({ items: [1] }));
    await withTfsCache(key, fetcher);
    await withTfsCache(key, fetcher, { forceRefresh: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("stale-while-revalidate", () => {
  beforeEach(() => {
    clearTfsResultCache();
  });

  it("serves the stale value and refreshes in the background near expiry", async () => {
    const key = buildTfsCacheKey("features", ["conn"]);
    let calls = 0;
    const fetcher = vi.fn(async () => ({ items: [++calls] }));

    // TTL 200 ms with a 1 s revalidate window: the entry is already "near expiry".
    writeTfsCache(key, { items: [0] }, 200);
    const result = await withTfsCache(key, fetcher, { ttlMs: 200, revalidateThresholdMs: 1000 });
    expect(result).toEqual({ items: [0] });

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(readTfsCache(key)).toEqual({ items: [1] });
  });

  it("does not refresh while the entry is comfortably fresh", async () => {
    const key = buildTfsCacheKey("bugs", ["fresh"]);
    const fetcher = vi.fn(async () => ({ items: [1] }));
    writeTfsCache(key, { items: [0] }, 60_000);
    await withTfsCache(key, fetcher, { ttlMs: 60_000, revalidateThresholdMs: 1000 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
