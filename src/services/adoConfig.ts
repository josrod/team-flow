// Shared helper to resolve the Azure DevOps connection configuration for any
// visitor. The `ado-public-connection` edge function returns the admin-saved
// configuration (including the decrypted token) so the browser — the only
// place that can reach the intranet TFS server — performs the requests.

import { supabase } from "@/integrations/supabase/client";


export interface PublicAdoConfig {
  serverUrl: string | null;
  collection: string | null;
  project: string | null;
  team: string | null;
  areaPaths: string[];
  iterationPaths: string[];
  bugsQueryId: string | null;
  epicsQueryId: string | null;
  epicsTags: string[];
  epicsProject: string | null;
  epicsTeam: string | null;
  epicsAreaPaths: string[];
  epicsIterationPaths: string[];
}

const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];

/** Non-sensitive Azure DevOps config, resolved through the secure edge function. */
export const loadPublicAdoConfig = async (): Promise<PublicAdoConfig | null> => {
  const row = await loadSharedAdoSettings();
  if (!row) return null;
  return {
    serverUrl: row.server_url ?? null,
    collection: row.collection ?? null,
    project: row.project ?? null,
    team: row.team ?? null,
    areaPaths: asArray(row.area_paths),
    iterationPaths: asArray(row.iteration_paths),
    bugsQueryId: row.bugs_query_id ?? null,
    epicsQueryId: row.epics_query_id ?? null,
    epicsTags: asArray(row.epics_tags),
    epicsProject: row.epics_project ?? null,
    epicsTeam: row.epics_team ?? null,
    epicsAreaPaths: asArray(row.epics_area_paths),
    epicsIterationPaths: asArray(row.epics_iteration_paths),
  };
};


/** Builds the "open in Azure DevOps" base URL from a config, when complete. */
export const buildAdoBaseUrl = (
  serverUrl: string | null | undefined,
  collection: string | null | undefined,
  project: string | null | undefined,
): string | null => {
  if (!serverUrl || !collection || !project) return null;
  const cleanServer = serverUrl.replace(/\/+$/, "");
  const cleanCollection = collection.replace(/^\/+|\/+$/g, "");
  const cleanProject = project.replace(/^\/+|\/+$/g, "");
  return `${cleanServer}/${cleanCollection}/${encodeURIComponent(cleanProject)}`;
};

/**
 * Shape of the shared Azure DevOps settings, mirroring the database row so the
 * pages can reuse the same code path they already use for the admin's own row.
 * `pat_encrypted` carries the already-decrypted token and `pat_iv` is null, so
 * `decryptPat` returns it unchanged.
 */
export interface SharedAdoSettingsRow {
  server_url: string;
  collection: string;
  project: string;
  team: string | null;
  pat_encrypted: string;
  pat_iv: null;
  area_paths: string[];
  iteration_paths: string[];
  bugs_query_id: string | null;
  epics_query_id: string | null;
  epics_tags: string[];
  epics_project: string | null;
  epics_team: string | null;
  epics_area_paths: string[];
  epics_iteration_paths: string[];
}

let sharedSettingsPromise: Promise<SharedAdoSettingsRow | null> | null = null;

/**
 * Loads the admin-configured Azure DevOps connection through the
 * `ado-public-connection` edge function so visitors without a session see the
 * same read-only data. Cached for the lifetime of the page.
 */
export const loadSharedAdoSettings = async (): Promise<SharedAdoSettingsRow | null> => {
  if (!sharedSettingsPromise) {
    sharedSettingsPromise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<SharedAdoSettingsRow>(
          "ado-public-connection",
          { method: "POST" },
        );
        if (error || !data || !data.server_url || !data.pat_encrypted) return null;
        return data;
      } catch {
        return null;
      }
    })();
  }
  return sharedSettingsPromise;
};


