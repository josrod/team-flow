// TFS / Azure DevOps Server (on-premise) REST API client.
// Runs entirely in the browser — requires the user to be on the corporate
// network (or VPN) where the TFS server is reachable, and TFS must allow
// CORS from the app origin.

export interface TfsConnection {
  serverUrl: string;
  collection: string;
  project: string;
  team?: string;
  pat: string;
}

export interface TfsProjectInfo {
  id: string;
  name: string;
  state: string;
  description: string;
}

export type TfsErrorKind =
  | "cors"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "timeout"
  | "mixed_content"
  | "http"
  | "unknown";

export interface TfsError {
  kind: TfsErrorKind;
  status?: number;
  message: string;
  /** Raw fetch error / response body excerpt — useful for the diagnostics panel. */
  detail?: string;
  /** Final URL that was attempted, for the diagnostics panel. */
  url: string;
}

export interface TfsTestResult {
  success: boolean;
  project?: TfsProjectInfo;
  error?: TfsError;
}

/** A single PAT scope check performed by the advanced diagnostic. */
export type TfsScopeId =
  | "project_team_read"
  | "work_items_read"
  | "work_read";

export type TfsScopeStatus = "ok" | "unauthorized" | "forbidden" | "not_found" | "network" | "skipped";

export interface TfsScopeCheck {
  id: TfsScopeId;
  /** Human-friendly scope label (e.g. "Project & Team (Read)"). */
  label: string;
  /** Required PAT scope name in TFS UI. */
  requiredScope: string;
  /** Endpoint that was probed. */
  endpoint: string;
  /** Final URL attempted. */
  url: string;
  status: TfsScopeStatus;
  /** HTTP status when the server responded. */
  httpStatus?: number;
  /** Short message explaining the outcome. */
  message: string;
  /** Body excerpt (≤300 chars) when relevant. */
  detail?: string;
}

export interface TfsDiagnosticResult {
  /** True when every required scope returned ok. */
  allPassed: boolean;
  checks: TfsScopeCheck[];
  /** Aggregated list of scopes that the PAT seems to be missing. */
  missingScopes: string[];
}

const API_VERSION = "5.0";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Build the base URL for a TFS collection without trailing slash:
 *   https://tfs.example.net/tfs/RNDCollection
 */
const buildCollectionUrl = (serverUrl: string, collection: string): string => {
  const cleanServer = serverUrl.trim().replace(/\/+$/, "");
  const cleanCollection = collection.trim().replace(/^\/+|\/+$/g, "");
  return `${cleanServer}/${cleanCollection}`;
};

/**
 * TFS / Azure DevOps Server uses HTTP Basic auth with an empty username
 * and the PAT as the password.
 */
const buildAuthHeader = (pat: string): string => {
  const token = btoa(`:${pat.trim()}`);
  return `Basic ${token}`;
};

const isNetworkLevelError = (err: unknown): err is TypeError => {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed")
  );
};

const isMixedContent = (url: string): boolean => {
  try {
    const target = new URL(url);
    return window.location.protocol === "https:" && target.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Test connectivity to a TFS project. Fetches the project metadata and
 * classifies any failure into a TfsErrorKind so the UI can show a
 * targeted hint (CORS, 401, timeout, etc.).
 */
export const testTfsConnection = async (
  conn: TfsConnection,
): Promise<TfsTestResult> => {
  const base = buildCollectionUrl(conn.serverUrl, conn.collection);
  const url = `${base}/_apis/projects/${encodeURIComponent(conn.project.trim())}?api-version=${API_VERSION}`;

  if (isMixedContent(url)) {
    return {
      success: false,
      error: {
        kind: "mixed_content",
        url,
        message:
          "Mixed content: la app se sirve por HTTPS pero el TFS usa HTTP. El navegador bloqueará la petición.",
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(conn.pat),
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const status = response.status;

      if (status === 401) {
        return {
          success: false,
          error: {
            kind: "unauthorized",
            status,
            url,
            message: "PAT inválido o expirado (401).",
            detail: body.slice(0, 300),
          },
        };
      }
      if (status === 403) {
        return {
          success: false,
          error: {
            kind: "forbidden",
            status,
            url,
            message: "PAT sin permisos suficientes (403).",
            detail: body.slice(0, 300),
          },
        };
      }
      if (status === 404) {
        return {
          success: false,
          error: {
            kind: "not_found",
            status,
            url,
            message: "Servidor, colección o proyecto no encontrado (404).",
            detail: body.slice(0, 300),
          },
        };
      }
      return {
        success: false,
        error: {
          kind: "http",
          status,
          url,
          message: `TFS devolvió HTTP ${status}.`,
          detail: body.slice(0, 300),
        },
      };
    }

    const data = (await response.json()) as TfsProjectInfo;
    return {
      success: true,
      project: {
        id: data.id,
        name: data.name,
        state: data.state,
        description: data.description ?? "",
      },
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        success: false,
        error: {
          kind: "timeout",
          url,
          message: `Tiempo de espera agotado tras ${REQUEST_TIMEOUT_MS / 1000}s.`,
          detail:
            "El servidor no respondió. Suele indicar que no eres alcanzable desde tu red (¿VPN apagada?) o que un firewall corta la conexión.",
        },
      };
    }
    if (isNetworkLevelError(err)) {
      return {
        success: false,
        error: {
          kind: "cors",
          url,
          message:
            "El navegador bloqueó la petición (probable CORS o servidor inaccesible).",
          detail:
            "El navegador no expone la causa exacta por seguridad. Abre DevTools → Network para ver si es CORS, DNS, certificado o conexión rechazada.",
        },
      };
    }
    return {
      success: false,
      error: {
        kind: "unknown",
        url,
        message: err instanceof Error ? err.message : "Error desconocido.",
      },
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Advanced PAT diagnostics
// ---------------------------------------------------------------------------

interface ProbeDefinition {
  id: TfsScopeId;
  label: string;
  requiredScope: string;
  /** Builds the URL to probe given the collection base + connection. */
  buildUrl: (base: string, conn: TfsConnection) => string | null;
}

const buildProbes = (): ProbeDefinition[] => [
  {
    id: "project_team_read",
    label: "Project & Team (Read)",
    requiredScope: "vso.project",
    buildUrl: (base, conn) =>
      `${base}/_apis/projects/${encodeURIComponent(conn.project.trim())}?api-version=${API_VERSION}`,
  },
  {
    id: "work_items_read",
    label: "Work Items (Read)",
    requiredScope: "vso.work",
    buildUrl: (base, conn) =>
      `${base}/${encodeURIComponent(conn.project.trim())}/_apis/wit/wiql?api-version=${API_VERSION}&$top=1`,
  },
  {
    id: "work_read",
    label: "Work (Read)",
    requiredScope: "vso.work",
    buildUrl: (base, conn) => {
      if (!conn.team?.trim()) return null;
      return `${base}/${encodeURIComponent(conn.project.trim())}/${encodeURIComponent(
        conn.team.trim(),
      )}/_apis/work/teamsettings/iterations?api-version=${API_VERSION}`;
    },
  },
];

const runProbe = async (
  probe: ProbeDefinition,
  conn: TfsConnection,
  base: string,
): Promise<TfsScopeCheck> => {
  const url = probe.buildUrl(base, conn);
  const baseCheck = {
    id: probe.id,
    label: probe.label,
    requiredScope: probe.requiredScope,
    endpoint: url ?? "",
    url: url ?? "",
  };

  if (!url) {
    return {
      ...baseCheck,
      status: "skipped",
      message: "No probado: configura un equipo para validar este permiso.",
    };
  }

  if (isMixedContent(url)) {
    return {
      ...baseCheck,
      status: "network",
      message: "Bloqueado por contenido mixto (HTTPS → HTTP).",
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const isWiql = probe.id === "work_items_read";
    const response = await fetch(url, {
      method: isWiql ? "POST" : "GET",
      headers: {
        Authorization: buildAuthHeader(conn.pat),
        Accept: "application/json",
        ...(isWiql ? { "Content-Type": "application/json" } : {}),
      },
      body: isWiql
        ? JSON.stringify({ query: "SELECT [System.Id] FROM WorkItems" })
        : undefined,
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        ...baseCheck,
        status: "ok",
        httpStatus: response.status,
        message: "Permiso disponible.",
      };
    }

    const body = await response.text().catch(() => "");
    const detail = body.slice(0, 300);

    if (response.status === 401) {
      return {
        ...baseCheck,
        status: "unauthorized",
        httpStatus: 401,
        message: "El servidor rechazó el PAT (401). Token inválido o expirado.",
        detail,
      };
    }
    if (response.status === 403) {
      return {
        ...baseCheck,
        status: "forbidden",
        httpStatus: 403,
        message: `Falta el scope ${probe.requiredScope} en el PAT (403).`,
        detail,
      };
    }
    if (response.status === 404) {
      return {
        ...baseCheck,
        status: "not_found",
        httpStatus: 404,
        message: "Recurso no encontrado (404). Revisa colección/proyecto/equipo.",
        detail,
      };
    }
    return {
      ...baseCheck,
      status: "network",
      httpStatus: response.status,
      message: `Respuesta inesperada HTTP ${response.status}.`,
      detail,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ...baseCheck,
        status: "network",
        message: `Tiempo de espera agotado tras ${REQUEST_TIMEOUT_MS / 1000}s.`,
      };
    }
    if (isNetworkLevelError(err)) {
      return {
        ...baseCheck,
        status: "network",
        message: "Sin respuesta del servidor (CORS, VPN o firewall).",
      };
    }
    return {
      ...baseCheck,
      status: "network",
      message: err instanceof Error ? err.message : "Error desconocido.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Probe each required PAT scope individually so the user can see exactly
 * which permission is missing or which resource returns 401/403.
 */
export const runPatDiagnostics = async (
  conn: TfsConnection,
): Promise<TfsDiagnosticResult> => {
  const base = buildCollectionUrl(conn.serverUrl, conn.collection);
  const probes = buildProbes();
  const checks = await Promise.all(probes.map((p) => runProbe(p, conn, base)));

  const missingScopes = Array.from(
    new Set(
      checks.filter((c) => c.status === "forbidden").map((c) => c.requiredScope),
    ),
  );

  const allPassed = checks.every(
    (c) => c.status === "ok" || c.status === "skipped",
  );

  return { allPassed, checks, missingScopes };
};

// ---------------------------------------------------------------------------
// Discovery helpers — used by the autocomplete inputs in the settings page
// to suggest valid collection / project / team names instead of relying on
// the user's memory.
// ---------------------------------------------------------------------------

export interface TfsCollectionRef {
  id: string;
  name: string;
}

export interface TfsProjectRef {
  id: string;
  name: string;
  description?: string;
}

export interface TfsTeamRef {
  id: string;
  name: string;
  description?: string;
}

export interface TfsDiscoveryResult<T> {
  items: T[];
  /** Non-fatal error — when present the caller should still treat items (if any) as best-effort. */
  error?: TfsError;
}

const buildServerUrl = (serverUrl: string): string =>
  serverUrl.trim().replace(/\/+$/, "");

interface RawListResponse<T> {
  count?: number;
  value?: T[];
}

const fetchJsonList = async <T>(
  url: string,
  pat: string,
): Promise<TfsDiscoveryResult<T>> => {
  if (isMixedContent(url)) {
    return {
      items: [],
      error: {
        kind: "mixed_content",
        url,
        message: "Mixed content: la app es HTTPS pero el TFS es HTTP.",
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(pat),
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        items: [],
        error: {
          kind:
            response.status === 401
              ? "unauthorized"
              : response.status === 403
              ? "forbidden"
              : response.status === 404
              ? "not_found"
              : "http",
          status: response.status,
          url,
          message: `HTTP ${response.status} al listar el recurso.`,
          detail: body.slice(0, 300),
        },
      };
    }

    const data = (await response.json()) as RawListResponse<T>;
    return { items: data.value ?? [] };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        items: [],
        error: {
          kind: "timeout",
          url,
          message: `Tiempo de espera agotado tras ${REQUEST_TIMEOUT_MS / 1000}s.`,
        },
      };
    }
    if (isNetworkLevelError(err)) {
      return {
        items: [],
        error: {
          kind: "cors",
          url,
          message: "Sin respuesta del servidor (CORS, VPN o firewall).",
        },
      };
    }
    return {
      items: [],
      error: {
        kind: "unknown",
        url,
        message: err instanceof Error ? err.message : "Error desconocido.",
      },
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * List all collections reachable from the TFS server root.
 * Endpoint: GET {server}/_apis/projectcollections
 */
export const listTfsCollections = async (
  serverUrl: string,
  pat: string,
): Promise<TfsDiscoveryResult<TfsCollectionRef>> => {
  if (!serverUrl.trim() || !pat.trim()) return { items: [] };
  const url = `${buildServerUrl(serverUrl)}/_apis/projectcollections?api-version=${API_VERSION}`;
  return fetchJsonList<TfsCollectionRef>(url, pat);
};

/**
 * List all projects inside a collection.
 * Endpoint: GET {server}/{collection}/_apis/projects?stateFilter=all
 */
export const listTfsProjects = async (
  serverUrl: string,
  collection: string,
  pat: string,
): Promise<TfsDiscoveryResult<TfsProjectRef>> => {
  if (!serverUrl.trim() || !collection.trim() || !pat.trim()) return { items: [] };
  const base = buildCollectionUrl(serverUrl, collection);
  const url = `${base}/_apis/projects?stateFilter=all&$top=500&api-version=${API_VERSION}`;
  return fetchJsonList<TfsProjectRef>(url, pat);
};

// ---------------------------------------------------------------------------
// Work item discovery (Features & Tasks) via WIQL
// ---------------------------------------------------------------------------

export interface TfsWorkItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo?: string;
  assignedToEmail?: string;
  parentId?: number;
  iterationPath?: string;
  areaPath?: string;
  tags?: string;
  url?: string;
}

interface WiqlResultRef {
  id: number;
  url?: string;
}

interface WiqlResponse {
  workItems?: WiqlResultRef[];
}

interface RawWorkItem {
  id: number;
  url?: string;
  fields: Record<string, unknown>;
}

interface RawWorkItemsResponse {
  value?: RawWorkItem[];
}

const parseAssignedTo = (val: unknown): { name?: string; email?: string } => {
  if (!val) return {};
  if (typeof val === "string") return { name: val };
  if (typeof val === "object" && val !== null) {
    const obj = val as { displayName?: string; uniqueName?: string };
    return { name: obj.displayName, email: obj.uniqueName };
  }
  return {};
};

const mapRawToWorkItem = (raw: RawWorkItem): TfsWorkItem => {
  const f = raw.fields ?? {};
  const assigned = parseAssignedTo(f["System.AssignedTo"]);
  return {
    id: raw.id,
    title: String(f["System.Title"] ?? ""),
    state: String(f["System.State"] ?? ""),
    workItemType: String(f["System.WorkItemType"] ?? ""),
    assignedTo: assigned.name,
    assignedToEmail: assigned.email,
    iterationPath: f["System.IterationPath"] as string | undefined,
    areaPath: f["System.AreaPath"] as string | undefined,
    tags: f["System.Tags"] as string | undefined,
    url: raw.url,
  };
};

const runWiqlAndFetch = async (
  conn: TfsConnection,
  wiql: string,
  fields: string[],
): Promise<TfsDiscoveryResult<TfsWorkItem>> => {
  const base = buildCollectionUrl(conn.serverUrl, conn.collection);
  const projectSeg = encodeURIComponent(conn.project.trim());
  const wiqlUrl = `${base}/${projectSeg}/_apis/wit/wiql?api-version=${API_VERSION}`;

  if (isMixedContent(wiqlUrl)) {
    return {
      items: [],
      error: { kind: "mixed_content", url: wiqlUrl, message: "Mixed content (HTTPS → HTTP)." },
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const wiqlRes = await fetch(wiqlUrl, {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(conn.pat),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: wiql }),
      signal: controller.signal,
    });

    if (!wiqlRes.ok) {
      const body = await wiqlRes.text().catch(() => "");
      return {
        items: [],
        error: {
          kind: wiqlRes.status === 401 ? "unauthorized" : wiqlRes.status === 403 ? "forbidden" : "http",
          status: wiqlRes.status,
          url: wiqlUrl,
          message: `WIQL falló con HTTP ${wiqlRes.status}.`,
          detail: body.slice(0, 300),
        },
      };
    }

    const wiqlData = (await wiqlRes.json()) as WiqlResponse;
    const ids = (wiqlData.workItems ?? []).map((w) => w.id);
    if (ids.length === 0) return { items: [] };

    // Batch in groups of 200 (WIT REST limit)
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));

    const all: TfsWorkItem[] = [];
    for (const batch of batches) {
      const fieldsParam = encodeURIComponent(fields.join(","));
      const detailsUrl = `${base}/_apis/wit/workitems?ids=${batch.join(",")}&fields=${fieldsParam}&api-version=${API_VERSION}`;
      const detailsRes = await fetch(detailsUrl, {
        method: "GET",
        headers: {
          Authorization: buildAuthHeader(conn.pat),
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!detailsRes.ok) continue;
      const data = (await detailsRes.json()) as RawWorkItemsResponse;
      for (const raw of data.value ?? []) all.push(mapRawToWorkItem(raw));
    }

    return { items: all };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        items: [],
        error: { kind: "timeout", url: wiqlUrl, message: "Tiempo de espera agotado." },
      };
    }
    if (isNetworkLevelError(err)) {
      return {
        items: [],
        error: { kind: "cors", url: wiqlUrl, message: "Sin respuesta (CORS, VPN o firewall)." },
      };
    }
    return {
      items: [],
      error: {
        kind: "unknown",
        url: wiqlUrl,
        message: err instanceof Error ? err.message : "Error desconocido.",
      },
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * Active feature states we care about in the dashboard.
 * Filters out Done / Closed / Removed / Cut so users only see live work.
 */
export const ACTIVE_FEATURE_STATES = ["Open", "In Refinement", "In Progress"] as const;

/**
 * Default scope applied when the user has not explicitly chosen areas /
 * iterations from the Settings page. Historically this was hard-coded;
 * now it is the fallback only.
 */
export const RODAT_AREA_PATH = "SDES\\Rodat";
export const RODAT_ITERATION_PATH = "SDES\\Rodat\\4.4";

// ---------------------------------------------------------------------------
// Classification nodes — list area & iteration trees so the Settings page
// can offer a real selector instead of free-text input. Endpoint:
//   GET {server}/{collection}/{project}/_apis/wit/classificationnodes/{group}
//        ?$depth=N&api-version=5.0
// ---------------------------------------------------------------------------

export type TfsClassificationGroup = "areas" | "iterations";

export interface TfsClassificationNode {
  /** Full path as TFS uses it (backslash-separated, no leading slash). */
  path: string;
  /** Leaf name only, useful for compact display. */
  name: string;
  /** Tree depth — 0 = project root. */
  depth: number;
}

interface RawClassificationNode {
  name: string;
  path?: string;
  hasChildren?: boolean;
  children?: RawClassificationNode[];
}

/**
 * TFS returns paths like `\SDES\Area\Rodat` (leading backslash, project name
 * replaced by `Area`/`Iteration`). Normalise them to the same form WIQL
 * uses: `SDES\Rodat`, `SDES\Rodat\4.4`, etc.
 */
const normalizeClassificationPath = (project: string, raw: string): string => {
  const trimmed = raw.replace(/^\\+/, "");
  const segments = trimmed.split("\\");
  // First segment is the project, second is "Area" or "Iteration" — drop it.
  if (segments.length >= 2 && (segments[1] === "Area" || segments[1] === "Iteration")) {
    return [project, ...segments.slice(2)].join("\\");
  }
  return trimmed;
};

const flattenNodes = (
  project: string,
  node: RawClassificationNode,
  depth: number,
  out: TfsClassificationNode[],
): void => {
  if (node.path) {
    out.push({
      path: normalizeClassificationPath(project, node.path),
      name: node.name,
      depth,
    });
  }
  for (const child of node.children ?? []) {
    flattenNodes(project, child, depth + 1, out);
  }
};

/**
 * List every area or iteration node under a project as a flat array of paths
 * (depth-first). Returns up to 10 levels of nesting which is enough for any
 * realistic ADO tree.
 */
export const listTfsClassificationNodes = async (
  serverUrl: string,
  collection: string,
  project: string,
  pat: string,
  group: TfsClassificationGroup,
): Promise<TfsDiscoveryResult<TfsClassificationNode>> => {
  if (!serverUrl.trim() || !collection.trim() || !project.trim() || !pat.trim()) {
    return { items: [] };
  }
  const base = buildCollectionUrl(serverUrl, collection);
  const url = `${base}/${encodeURIComponent(
    project.trim(),
  )}/_apis/wit/classificationnodes/${group}?$depth=10&api-version=${API_VERSION}`;

  if (isMixedContent(url)) {
    return { items: [], error: { kind: "mixed_content", url, message: "Mixed content (HTTPS → HTTP)." } };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: buildAuthHeader(pat), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        items: [],
        error: {
          kind: res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : "http",
          status: res.status,
          url,
          message: `HTTP ${res.status} al listar ${group === "areas" ? "áreas" : "iteraciones"}.`,
          detail: body.slice(0, 300),
        },
      };
    }
    const root = (await res.json()) as RawClassificationNode;
    const items: TfsClassificationNode[] = [];
    flattenNodes(project.trim(), root, 0, items);
    return { items };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { items: [], error: { kind: "timeout", url, message: "Tiempo de espera agotado." } };
    }
    if (isNetworkLevelError(err)) {
      return { items: [], error: { kind: "cors", url, message: "Sin respuesta (CORS, VPN o firewall)." } };
    }
    return {
      items: [],
      error: { kind: "unknown", url, message: err instanceof Error ? err.message : "Error desconocido." },
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

/**
 * List Features in the configured project, restricted to the given team's
 * area path(s) and to the active state set (Open, In Refinement, In Progress).
 *
 * When `teamAreaPaths` is empty/undefined, no area-path filter is applied
 * (used as a safe fallback when the team has no area mapping).
 */
export const listTfsFeatures = async (
  conn: TfsConnection,
  teamAreaPaths?: string[],
  configuredAreaPaths?: string[],
): Promise<TfsDiscoveryResult<TfsWorkItem>> => {
  const project = conn.project.trim().replace(/'/g, "''");
  const stateList = ACTIVE_FEATURE_STATES.map((s) => `'${s.replace(/'/g, "''")}'`).join(", ");

  // Effective scope precedence:
  //   1. Explicit user-configured areas from Settings (Settings dropdown).
  //   2. Team-resolved areas intersected with the legacy Rodat root.
  //   3. Fallback to the Rodat root only.
  const userAreas = (configuredAreaPaths ?? []).filter((p) => p.trim().length > 0);
  let areaList: string[];
  if (userAreas.length > 0) {
    areaList = userAreas;
  } else {
    const rodatTeamAreas = (teamAreaPaths ?? []).filter(
      (p) => p === RODAT_AREA_PATH || p.startsWith(`${RODAT_AREA_PATH}\\`),
    );
    areaList = rodatTeamAreas.length > 0 ? rodatTeamAreas : [RODAT_AREA_PATH];
  }
  const areaClause = ` AND (${areaList
    .map((p) => `[System.AreaPath] UNDER '${p.replace(/'/g, "''")}'`)
    .join(" OR ")})`;

  const wiql = `SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = '${project}'
  AND [System.WorkItemType] = 'Feature'
  AND [System.State] IN (${stateList})${areaClause}
ORDER BY [System.ChangedDate] DESC`;
  return runWiqlAndFetch(conn, wiql, [
    "System.Id",
    "System.Title",
    "System.State",
    "System.WorkItemType",
    "System.AssignedTo",
    "System.IterationPath",
    "System.AreaPath",
    "System.Tags",
  ]);
};

/**
 * List Tasks (and User Stories / Bugs) currently assigned in the project.
 * Hard-scoped to area `SDES\\Rodat` and iterations under `SDES\\Rodat\\4.4`.
 */
export const listTfsTasks = async (
  conn: TfsConnection,
): Promise<TfsDiscoveryResult<TfsWorkItem>> => {
  const project = conn.project.trim().replace(/'/g, "''");
  const areaEsc = RODAT_AREA_PATH.replace(/'/g, "''");
  const iterEsc = RODAT_ITERATION_PATH.replace(/'/g, "''");
  const wiql = `SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = '${project}'
  AND [System.WorkItemType] IN ('Task','User Story','Bug','Product Backlog Item')
  AND [System.State] <> 'Removed'
  AND [System.AreaPath] UNDER '${areaEsc}'
  AND [System.IterationPath] UNDER '${iterEsc}'
ORDER BY [System.ChangedDate] DESC`;
  return runWiqlAndFetch(conn, wiql, [
    "System.Id",
    "System.Title",
    "System.State",
    "System.WorkItemType",
    "System.AssignedTo",
    "System.IterationPath",
    "System.AreaPath",
    "System.Tags",
  ]);
};

/**
 * List teams inside a project.
 * Endpoint: GET {server}/{collection}/_apis/projects/{project}/teams
 */
export const listTfsTeams = async (
  serverUrl: string,
  collection: string,
  project: string,
  pat: string,
): Promise<TfsDiscoveryResult<TfsTeamRef>> => {
  if (
    !serverUrl.trim() ||
    !collection.trim() ||
    !project.trim() ||
    !pat.trim()
  ) {
    return { items: [] };
  }
  const base = buildCollectionUrl(serverUrl, collection);
  const url = `${base}/_apis/projects/${encodeURIComponent(
    project.trim(),
  )}/teams?$top=500&api-version=${API_VERSION}`;
  return fetchJsonList<TfsTeamRef>(url, pat);
};

// ---------------------------------------------------------------------------
// Team field values — used to scope features to the area paths that belong
// to a given team. Endpoint:
//   GET {server}/{collection}/{project}/{team}/_apis/work/teamsettings/teamfieldvalues
// Returns the default area + included sub-areas for the team.
// ---------------------------------------------------------------------------

interface TeamFieldValueRaw {
  value: string;
  includeChildren?: boolean;
}

interface TeamFieldValuesResponse {
  field?: { referenceName?: string };
  defaultValue?: string;
  values?: TeamFieldValueRaw[];
}

/**
 * Resolve the area paths configured for a team. Falls back to an empty list
 * (no area filter) when the team is unknown or the call fails.
 */
export const listTfsTeamAreaPaths = async (
  conn: TfsConnection,
  options: { force?: boolean } = {},
): Promise<TfsDiscoveryResult<string>> => {
  if (!conn.team?.trim()) return { items: [] };
  const base = buildCollectionUrl(conn.serverUrl, conn.collection);
  const url = `${base}/${encodeURIComponent(conn.project.trim())}/${encodeURIComponent(
    conn.team.trim(),
  )}/_apis/work/teamsettings/teamfieldvalues?api-version=${API_VERSION}`;

  // Cache lookup — avoids re-hitting teamfieldvalues on every team filter
  // change or page refresh within the TTL window.
  const cacheKey = buildAreaCacheKey(conn);
  if (!options.force) {
    const cached = readAreaCache(cacheKey);
    if (cached) return { items: cached };
  }

  if (isMixedContent(url)) {
    return { items: [], error: { kind: "mixed_content", url, message: "Mixed content (HTTPS → HTTP)." } };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: buildAuthHeader(conn.pat), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        items: [],
        error: {
          kind: res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : "http",
          status: res.status,
          url,
          message: `HTTP ${res.status} al leer team field values.`,
          detail: body.slice(0, 300),
        },
      };
    }
    const data = (await res.json()) as TeamFieldValuesResponse;
    const paths = (data.values ?? []).map((v) => v.value).filter(Boolean);
    writeAreaCache(cacheKey, paths);
    return { items: paths };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { items: [], error: { kind: "timeout", url, message: "Tiempo de espera agotado." } };
    }
    if (isNetworkLevelError(err)) {
      return { items: [], error: { kind: "cors", url, message: "Sin respuesta (CORS, VPN o firewall)." } };
    }
    return {
      items: [],
      error: { kind: "unknown", url, message: err instanceof Error ? err.message : "Error desconocido." },
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// In-memory TTL cache for team area paths.
// Lives for the lifetime of the JS module (cleared on full page reload).
// Keyed per (server + collection + project + team) so switching connections
// never returns stale data from another tenant.
// ---------------------------------------------------------------------------
interface AreaCacheEntry {
  paths: string[];
  expiresAt: number;
}

const AREA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const areaPathCache = new Map<string, AreaCacheEntry>();

const buildAreaCacheKey = (conn: TfsConnection): string =>
  [
    conn.serverUrl.trim().replace(/\/+$/, "").toLowerCase(),
    conn.collection.trim().toLowerCase(),
    conn.project.trim().toLowerCase(),
    (conn.team ?? "").trim().toLowerCase(),
  ].join("|");

const readAreaCache = (key: string): string[] | null => {
  const entry = areaPathCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    areaPathCache.delete(key);
    return null;
  }
  return entry.paths;
};

const writeAreaCache = (key: string, paths: string[]): void => {
  areaPathCache.set(key, { paths, expiresAt: Date.now() + AREA_CACHE_TTL_MS });
};

/**
 * Read cached area paths ignoring TTL. Used as a best-effort fallback when a
 * fresh fetch fails (network/CORS/timeout) so the UI can keep working with
 * the last known values instead of collapsing to an empty selector.
 * Returns `null` when no entry was ever cached for the connection.
 */
export const peekTfsAreaPathCache = (conn: TfsConnection): string[] | null => {
  const entry = areaPathCache.get(buildAreaCacheKey(conn));
  return entry ? entry.paths : null;
};

/** Clear cached area paths — call after editing the Azure DevOps settings. */
export const clearTfsAreaPathCache = (conn?: TfsConnection): void => {
  if (!conn) {
    areaPathCache.clear();
    return;
  }
  areaPathCache.delete(buildAreaCacheKey(conn));
};

// ---------------------------------------------------------------------------
// In-memory cache for the people list associated to a team's area paths.
// Populated after a successful TFS load; read as a best-effort fallback when a
// subsequent reload fails (network/CORS/HTTP) so the person selector keeps
// showing the last known roster instead of collapsing to an empty list.
//
// Keyed per (connection + set of area paths) so switching team/area set never
// returns stale data from another scope.
// ---------------------------------------------------------------------------
interface PeopleCacheEntry {
  people: string[];
  storedAt: number;
}

const peopleByAreaCache = new Map<string, PeopleCacheEntry>();

const normalizeAreaPathsKey = (paths: readonly string[]): string =>
  [...paths]
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("||");

const buildPeopleCacheKey = (conn: TfsConnection, areaPaths: readonly string[]): string =>
  `${buildAreaCacheKey(conn)}::${normalizeAreaPathsKey(areaPaths)}`;

/**
 * Persist the people list associated to the given connection + area paths
 * scope. Overwrites any previous entry. `people` is expected to be an already
 * de-duplicated, sorted list.
 */
export const writeTfsPeopleCache = (
  conn: TfsConnection,
  areaPaths: readonly string[],
  people: readonly string[],
): void => {
  peopleByAreaCache.set(buildPeopleCacheKey(conn, areaPaths), {
    people: [...people],
    storedAt: Date.now(),
  });
};

/**
 * Read the cached people list for an exact (connection + area paths) match.
 * No TTL is applied — the cache is a best-effort fallback and the caller
 * decides whether to surface a "stale" warning. Returns `null` when no
 * matching entry exists.
 */
export const peekTfsPeopleCache = (
  conn: TfsConnection,
  areaPaths: readonly string[],
): string[] | null => {
  const entry = peopleByAreaCache.get(buildPeopleCacheKey(conn, areaPaths));
  return entry ? entry.people : null;
};

/**
 * Fallback lookup when no exact (conn + areaPaths) entry exists. Returns the
 * most recently stored people list for the same connection (ignoring the
 * area-paths component of the key) so the selector degrades gracefully even
 * if the area list changed between calls. Returns `null` when nothing has
 * ever been cached for the connection.
 */
export const peekTfsPeopleCacheForConnection = (
  conn: TfsConnection,
): string[] | null => {
  const prefix = `${buildAreaCacheKey(conn)}::`;
  let best: PeopleCacheEntry | null = null;
  for (const [key, entry] of peopleByAreaCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (!best || entry.storedAt > best.storedAt) best = entry;
  }
  return best ? best.people : null;
};

/** Clear cached people lists — call after editing the Azure DevOps settings. */
export const clearTfsPeopleCache = (conn?: TfsConnection): void => {
  if (!conn) {
    peopleByAreaCache.clear();
    return;
  }
  const prefix = `${buildAreaCacheKey(conn)}::`;
  for (const key of Array.from(peopleByAreaCache.keys())) {
    if (key.startsWith(prefix)) peopleByAreaCache.delete(key);
  }
};
