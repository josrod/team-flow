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
