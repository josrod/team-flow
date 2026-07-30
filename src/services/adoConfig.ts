// Shared helper to resolve the Azure DevOps connection configuration for any
// visitor. Signed-in admins read the full settings row (including the
// encrypted PAT); anonymous visitors get only the non-sensitive fields through
// the `get_public_ado_config` database function, which never exposes the PAT.

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

/** Non-sensitive Azure DevOps config, readable without signing in. */
export const loadPublicAdoConfig = async (): Promise<PublicAdoConfig | null> => {
  const { data, error } = await supabase.rpc("get_public_ado_config");
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
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
