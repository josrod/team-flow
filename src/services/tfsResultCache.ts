/**
 * Client-side TTL cache for Azure DevOps (TFS) query results.
 *
 * The browser talks to TFS directly, so every page mount used to trigger a
 * fresh WIQL query plus work-item batches. This cache keeps successful results
 * for a comparatively long TTL (default 15 minutes) so navigating between
 * views, remounting a page, or reloading the tab reuses the last payload
 * instead of hammering the TFS server.
 *
 * Behaviour:
 * - Two layers: in-memory Map (fast) and sessionStorage (survives reloads in
 *   the same tab, never leaks results to another session).
 * - In-flight coalescing: concurrent calls with the same key share one request.
 * - Only successful results are cached; errors always fall through so the next
 *   attempt retries immediately.
 */

const STORAGE_PREFIX = "rosen.tfsCache.v1:";

/** Default TTL for cached TFS query results. */
export const TFS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const hasSessionStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
};

const readPersisted = <T>(key: string): CacheEntry<T> | null => {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed?.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writePersisted = <T>(key: string, entry: CacheEntry<T>): void => {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or serialization failure: memory cache still applies.
  }
};

const removePersisted = (key: string): void => {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Ignore storage failures.
  }
};

/** Read a cached value, or `null` when missing or expired. */
export const readTfsCache = <T>(key: string): T | null => {
  const entry = (memoryCache.get(key) as CacheEntry<T> | undefined) ?? readPersisted<T>(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    removePersisted(key);
    return null;
  }
  memoryCache.set(key, entry);
  return entry.value;
};

/** Store a value under `key` for `ttlMs` milliseconds. */
export const writeTfsCache = <T>(key: string, value: T, ttlMs: number = TFS_CACHE_TTL_MS): void => {
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
  memoryCache.set(key, entry);
  writePersisted(key, entry);
};

/** Remaining lifetime in milliseconds for a cached key (0 when absent). */
export const tfsCacheTimeToLive = (key: string): number => {
  const entry = (memoryCache.get(key) as CacheEntry<unknown> | undefined) ?? readPersisted<unknown>(key);
  if (!entry) return 0;
  return Math.max(0, entry.expiresAt - Date.now());
};

/** Drop every cached TFS result — call after the connection settings change. */
export const clearTfsResultCache = (): void => {
  memoryCache.clear();
  inFlight.clear();
  if (!hasSessionStorage()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Ignore storage failures.
  }
};

/** Build a stable cache key from arbitrary JSON-serializable parts. */
export const buildTfsCacheKey = (scope: string, parts: unknown): string => {
  try {
    return `${scope}|${JSON.stringify(parts)}`;
  } catch {
    return `${scope}|unserializable`;
  }
};

export interface WithTfsCacheOptions<T> {
  /** Skip the cache read and refetch (the fresh result is still stored). */
  forceRefresh?: boolean;
  /** Override the default TTL. */
  ttlMs?: number;
  /** Decide whether a result is worth caching (errors should return false). */
  isCacheable?: (value: T) => boolean;
  /**
   * Remaining lifetime under which the cached value is still served, but a
   * background refresh is triggered (stale-while-revalidate). Defaults to
   * `TFS_REVALIDATE_THRESHOLD_MS`. Set to 0 to disable.
   */
  revalidateThresholdMs?: number;
}

/** Below this remaining TTL a cached value is refreshed in the background. */
export const TFS_REVALIDATE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Run `fetcher` through the TTL cache, coalescing concurrent calls that share
 * the same key. When the cached entry is close to expiring, the stale value is
 * returned immediately and a background refresh keeps the cache warm, so the
 * next navigation never waits on TFS.
 */
export const withTfsCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: WithTfsCacheOptions<T> = {},
): Promise<T> => {
  const {
    forceRefresh = false,
    ttlMs = TFS_CACHE_TTL_MS,
    isCacheable,
    revalidateThresholdMs = TFS_REVALIDATE_THRESHOLD_MS,
  } = options;

  const runFetch = (): Promise<T> => {
    const promise = (async () => {
      const result = await fetcher();
      if (!isCacheable || isCacheable(result)) writeTfsCache(key, result, ttlMs);
      return result;
    })();

    inFlight.set(key, promise as Promise<unknown>);
    void promise.catch(() => undefined).finally(() => {
      if (inFlight.get(key) === (promise as Promise<unknown>)) inFlight.delete(key);
    });
    return promise;
  };

  if (!forceRefresh) {
    const cached = readTfsCache<T>(key);
    if (cached !== null) {
      const remaining = tfsCacheTimeToLive(key);
      const shouldRevalidate =
        revalidateThresholdMs > 0 && remaining > 0 && remaining <= revalidateThresholdMs;
      if (shouldRevalidate && !inFlight.has(key)) {
        // Fire and forget: failures leave the current entry in place.
        void runFetch().catch(() => undefined);
      }
      return cached;
    }
    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  return runFetch();
};

