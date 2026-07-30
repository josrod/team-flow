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

interface CachedSettings {
  expiresAt: number;
  serverUrl: string;
  pat: string;
}

let settingsCache: CachedSettings | null = null;

/** Read-only POST endpoints of the Azure DevOps REST API. */
const READ_ONLY_POST_PATTERNS = [/\/wiql(\/|\?|$)/i, /\/workitemsbatch(\/|\?|$)/i];


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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseBody(payload);
  if (!parsed) {
    return jsonResponse({ error: "Invalid request payload" }, 400);
  }
  if (parsed.method === "POST" && !READ_ONLY_POST_PATTERNS.some((re) => re.test(parsed.url))) {
    return jsonResponse({ error: "Only read-only requests are allowed" }, 403);
  }

  const key = cacheKey(parsed.method, parsed.url, parsed.body);
  if (!parsed.refresh) {
    const cached = readCache(key);
    if (cached) return cachedResponse(cached, "HIT");
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
      return jsonResponse({ error: "Could not read the Azure DevOps configuration" }, 500);
    }
    if (!data?.server_url || !data?.pat_encrypted) {
      return jsonResponse({ error: "No Azure DevOps configuration available" }, 404);
    }
    let pat: string;
    try {
      // Legacy rows saved before the vault landed hold plaintext with a null iv.
      pat = data.pat_iv ? await decryptPat(data.pat_encrypted, data.pat_iv) : data.pat_encrypted;
    } catch {
      return jsonResponse({ error: "Could not decrypt the stored credentials" }, 500);
    }
    settings = { serverUrl: data.server_url, pat, expiresAt: Date.now() + SETTINGS_TTL_MS };
    settingsCache = settings;
  }

  if (!isAllowedTarget(parsed.url, settings.serverUrl)) {
    return jsonResponse({ error: "Target URL is not allowed" }, 403);
  }

  const existing = !parsed.refresh ? inFlight.get(key) : undefined;
  if (existing) {
    try {
      return cachedResponse(await existing, "COALESCED");
    } catch {
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
    return cachedResponse(await task, "MISS");
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return jsonResponse(
      { error: aborted ? "Upstream request timed out" : "Could not reach the Azure DevOps server" },
      aborted ? 504 : 502,
    );
  }
});
