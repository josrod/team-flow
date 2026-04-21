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
