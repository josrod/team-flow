// Service layer for the backlog items board. Resolves the Azure DevOps
// connection (admin row when signed in, shared read-only connection otherwise),
// fetches Product Backlog Items / Bugs plus their child tasks and maps them to
// board cards. Shared by the Backlog items view and the dashboard sync panel so
// the cached TFS results are reused instead of importing data manually.
import { supabase } from "@/integrations/supabase/client";
import { listTfsBacklogItems, listTfsChildTasks } from "@/services/tfs";
import { decryptPat } from "@/services/tfsPatVault";
import { loadSharedAdoSettings } from "@/services/adoConfig";
import { buildBacklogCards, isRecentlyClosed, type BacklogCardItem } from "@/lib/backlogBoard";

export type BacklogErrorCode = "config_unavailable" | "config_incomplete" | "fetch";

export interface BacklogBoardResult {
  cards: BacklogCardItem[];
  baseUrl: string | null;
  errorCode?: BacklogErrorCode;
  errorMessage?: string;
}

interface AdoSettingsRow {
  server_url: string | null;
  collection: string | null;
  project: string;
  team: string | null;
  pat_encrypted: string;
  pat_iv: string | null;
  area_paths?: string[] | null;
  iteration_paths?: string[] | null;
}

const asPaths = (value: string[] | null | undefined): string[] =>
  (value ?? []).filter((path) => typeof path === "string" && path.trim().length > 0);

export const loadBacklogBoard = async (
  { userId, forceRefresh = false }: { userId?: string; forceRefresh?: boolean } = {},
): Promise<BacklogBoardResult> => {
  let settings: AdoSettingsRow | null = null;

  if (userId) {
    const { data } = await supabase
      .from("azure_devops_settings")
      .select("server_url, collection, project, team, pat_encrypted, pat_iv, area_paths, iteration_paths")
      .eq("user_id", userId)
      .maybeSingle();
    settings = data ?? null;
  }

  let sharedMissing = false;
  if (!settings?.server_url || !settings?.collection || !settings?.project || !settings?.pat_encrypted) {
    settings = await loadSharedAdoSettings();
    sharedMissing = !settings;
  }
  if (!settings?.server_url || !settings?.collection || !settings?.project || !settings?.pat_encrypted) {
    return {
      cards: [],
      baseUrl: null,
      errorCode: sharedMissing ? "config_unavailable" : "config_incomplete",
    };
  }

  let plainPat: string;
  try {
    plainPat = await decryptPat(settings.pat_encrypted, settings.pat_iv);
  } catch {
    return { cards: [], baseUrl: null, errorCode: "config_incomplete" };
  }

  const conn = {
    serverUrl: settings.server_url,
    collection: settings.collection,
    project: settings.project,
    team: settings.team ?? undefined,
    pat: plainPat,
  };
  const cleanServer = settings.server_url.replace(/\/+$/, "");
  const cleanCollection = settings.collection.replace(/^\/+|\/+$/g, "");
  const baseUrl = `${cleanServer}/${cleanCollection}/${encodeURIComponent(settings.project.replace(/^\/+|\/+$/g, ""))}`;

  const areaPaths = asPaths(settings.area_paths);
  const iterationPaths = asPaths(settings.iteration_paths);

  const itemsResult = await listTfsBacklogItems(conn, { areaPaths, iterationPaths }, { forceRefresh });
  if (itemsResult.error) {
    return { cards: [], baseUrl, errorCode: "fetch", errorMessage: itemsResult.error.message };
  }

  // Closed items are only relevant inside the recent window.
  const visible = itemsResult.items.filter(
    (item) => !item.state.toLowerCase().includes("closed") || isRecentlyClosed(item),
  );
  const childResult = await listTfsChildTasks(
    conn,
    visible.map((item) => item.id),
    { forceRefresh },
  );

  return {
    cards: buildBacklogCards(visible, childResult.items, baseUrl),
    baseUrl,
    errorCode: childResult.error ? "fetch" : undefined,
    errorMessage: childResult.error?.message,
  };
};
