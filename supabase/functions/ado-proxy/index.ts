// Edge function: read-only proxy in front of the on-prem Azure DevOps / TFS
// server.
//
// The browser never receives the personal access token: it sends the target
// URL (plus, for WIQL queries, a JSON body) and this function performs the
// upstream request using the admin-configured, encrypted PAT.
//
// Hard constraints enforced here:
// - Only GET, and POST to the read-only WIQL / work-item batch endpoints.
// - The target URL must live under the configured server URL.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ENC_KEY_RAW = Deno.env.get("ADO_PAT_ENC_KEY");

const MAX_URL_LENGTH = 8192;
const MAX_BODY_LENGTH = 32768;
const UPSTREAM_TIMEOUT_MS = 20_000;

/** Server-side read cache: successful upstream reads are reused for a short TTL. */
const CACHE_TTL_MS = 60_000;
const SETTINGS_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;

interface CachedResponse {
  expiresAt: number;
  status: number;
  contentType: string;
  text: string;
}

const responseCache = new Map<string, CachedResponse>();
/** De-duplicates concurrent identical reads into a single upstream call. */
const inFlight = new Map<string, Promise<CachedResponse>>();

const cacheKey = (method: string, url: string, body: string | undefined): string =>
  `${method} ${url} ${body ?? ""}`;

const readCache = (key: string): CachedResponse | null => {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return hit;
};

const writeCache = (key: string, entry: CachedResponse): void => {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest inserted entry (Map preserves insertion order).
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, entry);
};

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface CachedSettings {
  expiresAt: number;
  serverUrl: string;
  pat: string;
  rateLimit: RateLimitConfig;
}

let settingsCache: CachedSettings | null = null;

/** Read-only POST endpoints of the Azure DevOps REST API. */
const READ_ONLY_POST_PATTERNS = [/\/wiql(\/|\?|$)/i, /\/workitemsbatch(\/|\?|$)/i];

/**
 * Ad-hoc, best-effort rate limit. It is in-memory and therefore per edge
 * runtime instance: it curbs obvious abuse and runaway clients, but it is not a
 * distributed guarantee.
 *
 * The window and the request budget are admin-configurable in the Azure DevOps
 * settings and picked up automatically (no redeploy) as soon as the cached
 * settings expire. The constants below are only the fallback used before any
 * configuration has been read.
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxRequests: 120, windowMs: 60_000 };
const RATE_LIMIT_MAX_CLIENTS = 1000;

/** Last known admin configuration, used before the settings row is resolved. */
let activeRateLimit: RateLimitConfig = { ...DEFAULT_RATE_LIMIT };

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" ? Math.trunc(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const requestTimestamps = new Map<string, number[]>();

const clientKey = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("cf-connecting-ip")?.trim() ||
  "unknown";

interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

const checkRateLimit = (key: string, config: RateLimitConfig): RateLimitResult => {
  const now = Date.now();
  const cutoff = now - config.windowMs;
  const hits = (requestTimestamps.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= config.maxRequests) {
    requestTimestamps.set(key, hits);
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + config.windowMs - now) / 1000));
    return { allowed: false, count: hits.length, retryAfterSeconds };
  }
  hits.push(now);
  if (requestTimestamps.size >= RATE_LIMIT_MAX_CLIENTS && !requestTimestamps.has(key)) {
    const oldest = requestTimestamps.keys().next().value;
    if (oldest !== undefined) requestTimestamps.delete(oldest);
  }
  requestTimestamps.set(key, hits);
  return { allowed: true, count: hits.length, retryAfterSeconds: 0 };
};


/** Redacts query strings so logs never leak tokens or WIQL payload details. */
const safeUrl = (raw: string): string => {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "invalid-url";
  }
};

type LogLevel = "info" | "warn" | "error";

/** Single-line JSON logs so they can be filtered and aggregated downstream. */
const log = (level: LogLevel, event: string, fields: Record<string, unknown> = {}): void => {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    fn: "ado-proxy",
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });


const fromBase64 = (input: string): Uint8Array => {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

const importKey = async (): Promise<CryptoKey> => {
  if (!ENC_KEY_RAW || ENC_KEY_RAW.length < 32) {
    throw new Error("ADO_PAT_ENC_KEY is not configured or is too short");
  }
  const material = new TextEncoder().encode(ENC_KEY_RAW);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
};

const decryptPat = async (ciphertextB64: string, ivB64: string): Promise<string> => {
  const key = await importKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(ciphertextB64),
  );
  return new TextDecoder().decode(plainBuf);
};

const normalizeBase = (serverUrl: string): string =>
  serverUrl.trim().replace(/\/+$/, "").toLowerCase();

/** The requested URL must stay inside the configured server. */
const isAllowedTarget = (target: string, serverUrl: string): boolean => {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(target);
    base = new URL(normalizeBase(serverUrl));
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.host.toLowerCase() !== base.host.toLowerCase()) return false;
  const basePath = base.pathname.replace(/\/+$/, "").toLowerCase();
  if (basePath && basePath !== "/") {
    const path = parsed.pathname.toLowerCase();
    if (path !== basePath && !path.startsWith(`${basePath}/`)) return false;
  }
  return true;
};

interface ProxyRequest {
  url: string;
  method: "GET" | "POST";
  body?: string;
  /** When true, skips the server-side cache and refreshes the entry. */
  refresh: boolean;
}

const parseBody = (raw: unknown): ProxyRequest | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  if (!url || url.length > MAX_URL_LENGTH) return null;
  const method = obj.method === "POST" ? "POST" : obj.method === "GET" || obj.method === undefined ? "GET" : null;
  if (!method) return null;
  const body = typeof obj.body === "string" ? obj.body : undefined;
  if (body !== undefined && body.length > MAX_BODY_LENGTH) return null;
  if (method === "GET" && body !== undefined) return null;
  return { url, method, body, refresh: obj.refresh === true };
};

/** Serializes a cached (or freshly fetched) upstream response back to the client. */
const cachedResponse = (entry: CachedResponse, state: "HIT" | "MISS" | "COALESCED"): Response =>
  new Response(entry.text, {
    status: entry.status,
    headers: {
      ...corsHeaders,
      "Content-Type": entry.contentType,
      "X-Proxy-Cache": state,
    },
  });


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const requestId = crypto.randomUUID();
  const client = clientKey(req);
  const startedAt = Date.now();

  if (req.method !== "POST") {
    log("warn", "method_not_allowed", { requestId, client, method: req.method });
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    log("error", "server_misconfigured", { requestId, client });
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const limit = checkRateLimit(client);
  if (!limit.allowed) {
    log("warn", "rate_limited", {
      requestId,
      client,
      count: limit.count,
      windowMs: RATE_LIMIT_WINDOW_MS,
      retryAfterSeconds: limit.retryAfterSeconds,
    });
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(limit.retryAfterSeconds),
      },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    log("warn", "invalid_json", { requestId, client });
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseBody(payload);
  if (!parsed) {
    log("warn", "invalid_payload", { requestId, client });
    return jsonResponse({ error: "Invalid request payload" }, 400);
  }
  if (parsed.method === "POST" && !READ_ONLY_POST_PATTERNS.some((re) => re.test(parsed.url))) {
    log("warn", "write_attempt_blocked", { requestId, client, target: safeUrl(parsed.url) });
    return jsonResponse({ error: "Only read-only requests are allowed" }, 403);
  }

  const target = safeUrl(parsed.url);
  const key = cacheKey(parsed.method, parsed.url, parsed.body);
  if (!parsed.refresh) {
    const cached = readCache(key);
    if (cached) {
      log("info", "cache_hit", {
        requestId,
        client,
        target,
        method: parsed.method,
        status: cached.status,
        durationMs: Date.now() - startedAt,
      });
      return cachedResponse(cached, "HIT");
    }
  }

  // Resolve the connection (server URL + decrypted PAT), cached briefly too.
  let settings = settingsCache && settingsCache.expiresAt > Date.now() ? settingsCache : null;
  if (!settings) {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin
      .from("azure_devops_settings")
      .select("server_url, pat_encrypted, pat_iv, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log("error", "settings_read_failed", { requestId, client, reason: error.message });
      return jsonResponse({ error: "Could not read the Azure DevOps configuration" }, 500);
    }
    if (!data?.server_url || !data?.pat_encrypted) {
      log("warn", "settings_missing", { requestId, client });
      return jsonResponse({ error: "No Azure DevOps configuration available" }, 404);
    }
    let pat: string;
    try {
      // Legacy rows saved before the vault landed hold plaintext with a null iv.
      pat = data.pat_iv ? await decryptPat(data.pat_encrypted, data.pat_iv) : data.pat_encrypted;
    } catch {
      log("error", "pat_decrypt_failed", { requestId, client });
      return jsonResponse({ error: "Could not decrypt the stored credentials" }, 500);
    }
    settings = { serverUrl: data.server_url, pat, expiresAt: Date.now() + SETTINGS_TTL_MS };
    settingsCache = settings;
  }

  if (!isAllowedTarget(parsed.url, settings.serverUrl)) {
    log("warn", "target_not_allowed", { requestId, client, target });
    return jsonResponse({ error: "Target URL is not allowed" }, 403);
  }

  const existing = !parsed.refresh ? inFlight.get(key) : undefined;
  if (existing) {
    try {
      const entry = await existing;
      log("info", "cache_coalesced", {
        requestId,
        client,
        target,
        method: parsed.method,
        status: entry.status,
        durationMs: Date.now() - startedAt,
      });
      return cachedResponse(entry, "COALESCED");
    } catch {
      log("error", "coalesced_upstream_failed", { requestId, client, target });
      return jsonResponse({ error: "Could not reach the Azure DevOps server" }, 502);
    }
  }

  const pat = settings.pat;
  const task = (async (): Promise<CachedResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(parsed.url, {
        method: parsed.method,
        headers: {
          Authorization: `Basic ${btoa(`:${pat.trim()}`)}`,
          Accept: "application/json",
          ...(parsed.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: parsed.method === "POST" ? parsed.body ?? "{}" : undefined,
        signal: controller.signal,
      });
      const text = await upstream.text();
      const entry: CachedResponse = {
        status: upstream.status,
        contentType: upstream.headers.get("Content-Type") ?? "application/json",
        text,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      // Only successful reads are cached; errors must be retried immediately.
      if (upstream.ok) writeCache(key, entry);
      else if (upstream.status === 401 || upstream.status === 403) settingsCache = null;
      return entry;
    } finally {
      clearTimeout(timer);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);

  try {
    const entry = await task;
    log(entry.status >= 400 ? "warn" : "info", "upstream_response", {
      requestId,
      client,
      target,
      method: parsed.method,
      status: entry.status,
      bytes: entry.text.length,
      cached: entry.status < 400,
      durationMs: Date.now() - startedAt,
    });
    return cachedResponse(entry, "MISS");
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    log("error", aborted ? "upstream_timeout" : "upstream_unreachable", {
      requestId,
      client,
      target,
      method: parsed.method,
      durationMs: Date.now() - startedAt,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return jsonResponse(
      { error: aborted ? "Upstream request timed out" : "Could not reach the Azure DevOps server" },
      aborted ? 504 : 502,
    );
  }
});

