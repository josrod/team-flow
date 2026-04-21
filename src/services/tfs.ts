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

export interface TfsTestResult {
  success: boolean;
  project?: TfsProjectInfo;
  error?: string;
}

const API_VERSION = "5.0";

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

const isCorsOrNetworkError = (err: unknown): boolean => {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror");
};

/**
 * Test connectivity to a TFS project. Fetches the project metadata.
 */
export const testTfsConnection = async (
  conn: TfsConnection,
): Promise<TfsTestResult> => {
  const base = buildCollectionUrl(conn.serverUrl, conn.collection);
  const url = `${base}/_apis/projects/${encodeURIComponent(conn.project.trim())}?api-version=${API_VERSION}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(conn.pat),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      let message = `TFS returned ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        message = "PAT inválido o sin permisos suficientes";
      } else if (response.status === 404) {
        message = "Servidor, colección o proyecto no encontrado";
      } else {
        const body = await response.text();
        message = `TFS ${response.status}: ${body.slice(0, 200)}`;
      }
      return { success: false, error: message };
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
    if (isCorsOrNetworkError(err)) {
      return {
        success: false,
        error:
          "No se pudo contactar con el servidor TFS. Comprueba que estás en la red corporativa / VPN y que el servidor permite CORS desde esta aplicación.",
      };
    }
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { success: false, error: msg };
  }
};
