import { supabase } from "@/integrations/supabase/client";

export interface EpicVersion {
  id: string;
  name: string;
  colorKey: string;
  sortOrder: number;
}

/** epicId (Azure DevOps work item id, as text) -> version id */
export type EpicVersionAssignments = Record<string, string>;

interface EpicVersionRow {
  id: string;
  name: string;
  color_key: string;
  sort_order: number;
}

const toVersion = (row: EpicVersionRow): EpicVersion => ({
  id: row.id,
  name: row.name,
  colorKey: row.color_key,
  sortOrder: row.sort_order,
});

export const listEpicVersions = async (): Promise<EpicVersion[]> => {
  const { data, error } = await supabase
    .from("epic_versions")
    .select("id, name, color_key, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toVersion);
};

export const listEpicVersionAssignments = async (): Promise<EpicVersionAssignments> => {
  const { data, error } = await supabase
    .from("epic_version_assignments")
    .select("epic_id, version_id");
  if (error) throw new Error(error.message);
  const map: EpicVersionAssignments = {};
  for (const row of data ?? []) map[row.epic_id] = row.version_id;
  return map;
};

export const createEpicVersion = async (
  name: string,
  colorKey: string,
  sortOrder: number,
): Promise<EpicVersion> => {
  const { data, error } = await supabase
    .from("epic_versions")
    .insert({ name, color_key: colorKey, sort_order: sortOrder })
    .select("id, name, color_key, sort_order")
    .single();
  if (error) throw new Error(error.message);
  return toVersion(data as EpicVersionRow);
};

export const updateEpicVersion = async (
  id: string,
  patch: { name?: string; colorKey?: string; sortOrder?: number },
): Promise<void> => {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.colorKey !== undefined) payload.color_key = patch.colorKey;
  if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
  const { error } = await supabase.from("epic_versions").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
};

export const deleteEpicVersion = async (id: string): Promise<void> => {
  const { error } = await supabase.from("epic_versions").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

/** Assign a version to an epic, or clear it when versionId is null. */
export const setEpicVersion = async (
  epicId: string,
  versionId: string | null,
): Promise<void> => {
  if (versionId === null) {
    const { error } = await supabase
      .from("epic_version_assignments")
      .delete()
      .eq("epic_id", epicId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("epic_version_assignments")
    .upsert({ epic_id: epicId, version_id: versionId }, { onConflict: "epic_id" });
  if (error) throw new Error(error.message);
};
