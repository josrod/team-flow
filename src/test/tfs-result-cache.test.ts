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
