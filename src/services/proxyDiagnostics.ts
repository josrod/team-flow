// Admin-facing connectivity diagnostics for the read-only Azure DevOps proxy.
//
// Every check goes through the same public code path a visitor would use, so
// the results reflect what anonymous users actually experience. No personal
// access token is ever handled here: the proxy performs the upstream call
// server-side.

import { supabase } from "@/integrations/supabase/client";
import { loadPublicAdoConfig } from "@/services/adoConfig";
import { PROXY_PAT_SENTINEL } from "@/services/tfs";

export type ProxyCheckId =
  | "public_config"
  | "shared_connection"
  | "proxy_reachable"
  | "collection_visible"
  | "project_visible"
  | "write_blocked";

export type ProxyCheckStatus = "ok" | "warning" | "error" | "skipped";

export interface ProxyCheck {
  id: ProxyCheckId;
  status: ProxyCheckStatus;
  /** Short outcome message, already localized by the caller when needed. */
  message: string;
  /** Extra technical context (HTTP status, cache state, excerpt). */
  detail?: string;
  /** Round-trip time in milliseconds when a request was performed. */
  durationMs?: number;
}

export interface ProxyDiagnosticsResult {
  checks: ProxyCheck[];
  allPassed: boolean;
  ranAt: string;
}

export interface ProxyDiagnosticsInput {
  /** Values currently typed in the settings form, used to detect mismatches. */
  serverUrl: string;
  collection: string;
  project: string;
}

const API_VERSION = "5.0";

const proxyEndpoint = (): string => {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/ado-proxy`;
};

const publishableKey = (): string => String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();

const buildCollectionUrl = (serverUrl: string, collection: string): string =>
  `${serverUrl.trim().replace(/\/+$/, "")}/${collection.trim().replace(/^\/+|\/+$/g, "")}`;

interface ProxyCallResult {
  ok: boolean;
  status: number;
  cache: string | null;
  durationMs: number;
  excerpt: string;
  networkError?: string;
}

/** Performs one request through the proxy edge function. */
const callProxy = async (
  url: string,
  method: "GET" | "POST",
  body?: string,
): Promise<ProxyCallResult> => {
  const startedAt = performance.now();
  try {
    const response = await fetch(proxyEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey(),
        Authorization: `Bearer ${publishableKey()}`,
      },
      body: JSON.stringify({ url, method, body, refresh: true }),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      cache: response.headers.get("X-Proxy-Cache"),
      durationMs: Math.round(performance.now() - startedAt),
      excerpt: text.slice(0, 300),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      cache: null,
      durationMs: Math.round(performance.now() - startedAt),
      excerpt: "",
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
};

interface SharedConnectionRow {
  server_url?: string;
  collection?: string;
  project?: string;
  pat_encrypted?: string;
}

/**
 * Runs the full proxy diagnostic sequence. Messages are plain English
 * technical strings, consistent with the rest of the TFS diagnostics.
 */
export const runProxyDiagnostics = async (
  input: ProxyDiagnosticsInput,
): Promise<ProxyDiagnosticsResult> => {
  const checks: ProxyCheck[] = [];

  // 1) Public (non-sensitive) configuration readable without a session.
  const publicConfig = await loadPublicAdoConfig();
  if (!publicConfig) {
    checks.push({
      id: "public_config",
      status: "error",
      message: "The public configuration could not be read.",
      detail: "get_public_ado_config returned no row. Save the settings first.",
    });
  } else {
    const mismatches: string[] = [];
    if (normalize(publicConfig.serverUrl) !== normalize(input.serverUrl)) mismatches.push("server URL");
    if (normalize(publicConfig.collection) !== normalize(input.collection)) mismatches.push("collection");
    if (normalize(publicConfig.project) !== normalize(input.project)) mismatches.push("project");
    checks.push({
      id: "public_config",
      status: mismatches.length === 0 ? "ok" : "warning",
      message:
        mismatches.length === 0
          ? "Public configuration matches the saved settings."
          : `Unsaved differences detected: ${mismatches.join(", ")}.`,
      detail: `${publicConfig.serverUrl ?? "-"} / ${publicConfig.collection ?? "-"} / ${publicConfig.project ?? "-"}`,
    });
  }

  // 2) Shared connection endpoint must return the sentinel, never a real PAT.
  const sharedStart = performance.now();
  let sharedOk = false;
  try {
    const { data, error } = await supabase.functions.invoke<SharedConnectionRow>(
      "ado-public-connection",
      { method: "POST" },
    );
    const durationMs = Math.round(performance.now() - sharedStart);
    if (error || !data?.server_url || !data?.pat_encrypted) {
      checks.push({
        id: "shared_connection",
        status: "error",
        message: "The shared connection endpoint did not return a usable configuration.",
        detail: error ? error.message : "Missing server_url or credentials.",
        durationMs,
      });
    } else if (data.pat_encrypted !== PROXY_PAT_SENTINEL) {
      checks.push({
        id: "shared_connection",
        status: "error",
        message: "The shared connection returned a token instead of the proxy sentinel.",
        detail: "Visitors must never receive credentials. Review ado-public-connection.",
        durationMs,
      });
    } else {
      sharedOk = true;
      checks.push({
        id: "shared_connection",
        status: "ok",
        message: "Shared connection served with the proxy sentinel (no token exposed).",
        detail: `${data.server_url} / ${data.collection ?? "-"} / ${data.project ?? "-"}`,
        durationMs,
      });
    }
  } catch (err) {
    checks.push({
      id: "shared_connection",
      status: "error",
      message: "The shared connection endpoint is unreachable.",
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - sharedStart),
    });
  }

  const serverUrl = publicConfig?.serverUrl ?? input.serverUrl;
  const collection = publicConfig?.collection ?? input.collection;
  const project = publicConfig?.project ?? input.project;
  const canProbe = Boolean(serverUrl.trim() && collection.trim());

  if (!canProbe) {
    for (const id of ["proxy_reachable", "collection_visible", "project_visible", "write_blocked"] as const) {
      checks.push({
        id,
        status: "skipped",
        message: "Skipped: server URL and collection are required.",
      });
    }
    return {
      checks,
      allPassed: false,
      ranAt: new Date().toISOString(),
    };
  }

  const base = buildCollectionUrl(serverUrl, collection);

  // 3) + 4) Proxy reachability and collection visibility (single upstream read).
  const projectsUrl = `${base}/_apis/projects?api-version=${API_VERSION}&$top=1`;
  const projectsCall = await callProxy(projectsUrl, "GET");
  if (projectsCall.networkError) {
    checks.push({
      id: "proxy_reachable",
      status: "error",
      message: "The proxy edge function is unreachable from the browser.",
      detail: projectsCall.networkError,
      durationMs: projectsCall.durationMs,
    });
  } else {
    checks.push({
      id: "proxy_reachable",
      status: projectsCall.status > 0 && projectsCall.status !== 500 ? "ok" : "error",
      message:
        projectsCall.status > 0
          ? `Proxy responded with HTTP ${projectsCall.status}.`
          : "No response from the proxy.",
      detail: `Cache: ${projectsCall.cache ?? "n/a"}`,
      durationMs: projectsCall.durationMs,
    });
  }

  const describeUpstream = (call: ProxyCallResult): { status: ProxyCheckStatus; message: string } => {
    if (call.networkError) return { status: "error", message: "Network error while calling the proxy." };
    if (call.ok) return { status: "ok", message: `Reachable (HTTP ${call.status}).` };
    if (call.status === 401 || call.status === 403) {
      return { status: "error", message: `Rejected by the server (HTTP ${call.status}). Check the stored PAT scopes.` };
    }
    if (call.status === 404) return { status: "error", message: "Not found (HTTP 404). Check the configured values." };
    if (call.status === 429) return { status: "warning", message: "Rate limited by the proxy (HTTP 429)." };
    if (call.status === 502 || call.status === 504) {
      return { status: "error", message: `The proxy could not reach the server (HTTP ${call.status}).` };
    }
    return { status: "error", message: `Unexpected response (HTTP ${call.status}).` };
  };

  const collectionOutcome = describeUpstream(projectsCall);
  checks.push({
    id: "collection_visible",
    status: collectionOutcome.status,
    message: collectionOutcome.message,
    detail: `${base}/_apis/projects${projectsCall.excerpt ? ` — ${projectsCall.excerpt}` : ""}`,
    durationMs: projectsCall.durationMs,
  });

  // 5) Project visibility.
  if (!project.trim()) {
    checks.push({
      id: "project_visible",
      status: "skipped",
      message: "Skipped: no project configured.",
    });
  } else {
    const projectUrl = `${base}/_apis/projects/${encodeURIComponent(project.trim())}?api-version=${API_VERSION}`;
    const projectCall = await callProxy(projectUrl, "GET");
    const outcome = describeUpstream(projectCall);
    checks.push({
      id: "project_visible",
      status: outcome.status,
      message: outcome.message,
      detail: `${project.trim()}${projectCall.excerpt ? ` — ${projectCall.excerpt}` : ""}`,
      durationMs: projectCall.durationMs,
    });
  }

  // 6) Write attempts must be rejected by the proxy (defence in depth).
  const writeCall = await callProxy(`${base}/_apis/wit/workitems/$Task?api-version=${API_VERSION}`, "POST", "[]");
  checks.push({
    id: "write_blocked",
    status: writeCall.status === 403 ? "ok" : "error",
    message:
      writeCall.status === 403
        ? "Write requests are rejected by the proxy."
        : `Expected HTTP 403 for a write attempt, got ${writeCall.status || "no response"}.`,
    detail: writeCall.excerpt || writeCall.networkError,
    durationMs: writeCall.durationMs,
  });

  const allPassed =
    sharedOk && checks.every((c) => c.status === "ok" || c.status === "skipped" || c.status === "warning");

  return {
    checks,
    allPassed: allPassed && checks.every((c) => c.status !== "error"),
    ranAt: new Date().toISOString(),
  };
};
