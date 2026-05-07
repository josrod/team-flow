// Pure helpers for assigning TFS tasks to features so the per-card task
// counts always sum to the global total shown in the upper summary banner.
import type { TfsWorkItem } from "@/services/tfs";

export interface AssignedFeature {
  id: string;
  title: string;
  state: string;
  assignee?: string;
  taskCount: number;
  doneCount: number;
}

export const ORPHAN_FEATURE_ID = "__orphans__";

const normalizeStateBucket = (state: string): "active" | "pending" | "done" | "blocked" => {
  const s = state.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("complet") || s.includes("resolved")) return "done";
  if (s.includes("block")) return "blocked";
  if (s.includes("active") || s.includes("progress") || s.includes("doing")) return "active";
  return "pending";
};

/**
 * Assigns each task to exactly one feature using:
 *  1. System.Parent link (parentId)
 *  2. Exact areaPath match (first feature found for that area)
 *  3. Synthetic "orphans" bucket so every task is counted exactly once.
 *
 * Guarantees: sum(feature.taskCount) === tasks.length.
 */
export const assignTasksToFeatures = (
  features: readonly TfsWorkItem[],
  tasks: readonly TfsWorkItem[],
): AssignedFeature[] => {
  const featureById = new Map<number, TfsWorkItem>();
  features.forEach((f) => featureById.set(f.id, f));

  const featuresByArea = new Map<string, TfsWorkItem>();
  features.forEach((f) => {
    if (f.areaPath && !featuresByArea.has(f.areaPath)) featuresByArea.set(f.areaPath, f);
  });

  const tasksByFeature = new Map<string, TfsWorkItem[]>();
  const orphans: TfsWorkItem[] = [];

  tasks.forEach((t) => {
    let target: TfsWorkItem | undefined;
    if (t.parentId !== undefined && featureById.has(t.parentId)) {
      target = featureById.get(t.parentId);
    } else if (t.areaPath && featuresByArea.has(t.areaPath)) {
      target = featuresByArea.get(t.areaPath);
    }
    if (!target) {
      orphans.push(t);
      return;
    }
    const key = String(target.id);
    if (!tasksByFeature.has(key)) tasksByFeature.set(key, []);
    tasksByFeature.get(key)!.push(t);
  });

  const result: AssignedFeature[] = features.map((f) => {
    const childTasks = tasksByFeature.get(String(f.id)) ?? [];
    return {
      id: String(f.id),
      title: f.title,
      state: f.state,
      assignee: f.assignedTo,
      taskCount: childTasks.length,
      doneCount: childTasks.filter((t) => normalizeStateBucket(t.state) === "done").length,
    };
  });

  if (orphans.length > 0) {
    result.push({
      id: ORPHAN_FEATURE_ID,
      title: "Sin feature asociada",
      state: "Pending",
      taskCount: orphans.length,
      doneCount: orphans.filter((t) => normalizeStateBucket(t.state) === "done").length,
    });
  }

  return result;
};
