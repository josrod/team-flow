// Service layer for the waiting board: resolves the Azure DevOps connection
// (admin row when signed in, shared connection otherwise), fetches tasks and
// features and maps them to `WaitingItem`s. Shared by the Waiting board, the
// weekly digest and the alert centre so the cached TFS results are reused.
import { supabase } from "@/integrations/supabase/client";
import { listTfsFeatures, listTfsTasks, RODAT_AREA_PATH, RODAT_ITERATION_PATH, type TfsWorkItem } from "@/services/tfs";
import { decryptPat } from "@/services/tfsPatVault";
import { loadSharedAdoSettings } from "@/services/adoConfig";
import { parseTfsTags } from "@/lib/tfsTags";
import { pathLeaf, type WaitingItem } from "@/lib/waitingGroups";

export type WaitingBoardErrorCode = "config_unavailable" | "config_incomplete" | "fetch";

export interface WaitingBoardResult {
  items: WaitingItem[];
  baseUrl: string | null;
  errorCode?: WaitingBoardErrorCode;
  errorMessage?: string;
}

const isPathUnder = (path: string | undefined, root: string) =>
  Boolean(path && (path === root || path.startsWith(`${root}\\`)));

export const loadWaitingBoard = async (
  { userId, forceRefresh = false }: { userId?: string; forceRefresh?: boolean } = {},
): Promise<WaitingBoardResult> => {
  let settings: {
    server_url: string | null;
    collection: string | null;
    project: string;
    team: string | null;
    pat_encrypted: string;
    pat_iv: string | null;
    area_paths?: string[] | null;
    iteration_paths?: string[] | null;
  } | null = null;

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
    return { items: [], baseUrl: null, errorCode: sharedMissing ? "config_unavailable" : "config_incomplete" };
  }

  let plainPat: string;
  try {
    plainPat = await decryptPat(settings.pat_encrypted, settings.pat_iv);
  } catch {
    return { items: [], baseUrl: null, errorCode: "config_incomplete" };
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

  const userAreas = (settings.area_paths ?? []).filter((p: string) => p && p.trim().length > 0);
  const userIters = (settings.iteration_paths ?? []).filter((p: string) => p && p.trim().length > 0);
  const effectiveAreas = userAreas.length > 0 ? userAreas : [RODAT_AREA_PATH];
  const effectiveIters = userIters.length > 0 ? userIters : [RODAT_ITERATION_PATH];

  const [featRes, taskRes] = await Promise.all([
    listTfsFeatures(conn, [], userAreas, { forceRefresh }),
    listTfsTasks(conn, userAreas, userIters, { forceRefresh }),
  ]);
  if (taskRes.error) {
    return { items: [], baseUrl, errorCode: "fetch", errorMessage: taskRes.error.message };
  }

  const featureById = new Map<number, TfsWorkItem>();
  featRes.items.forEach((f) => featureById.set(f.id, f));

  const items: WaitingItem[] = taskRes.items
    .filter(
      (it) =>
        effectiveAreas.some((root: string) => isPathUnder(it.areaPath, root)) &&
        effectiveIters.some((root: string) => isPathUnder(it.iterationPath, root)),
    )
    .map((it) => {
      const parent = it.parentId !== undefined ? featureById.get(it.parentId) : undefined;
      const theme = parent?.title ?? pathLeaf(it.iterationPath) ?? pathLeaf(it.areaPath) ?? "";
      return {
        id: String(it.id),
        title: it.title,
        state: it.state,
        type: it.workItemType,
        assignee: it.assignedTo,
        theme,
        tags: parseTfsTags(it.tags),
        changedDate: it.changedDate,
      };
    });

  return { items, baseUrl };
};
