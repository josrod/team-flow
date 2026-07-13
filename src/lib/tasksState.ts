// Shared helpers for classifying TFS tasks/bugs by state and computing WIP.
// Kept as pure functions so they can be unit-tested in isolation.

export type NormalizedState =
  | "active"
  | "pending"
  | "done"
  | "blocked"
  | "resolved"
  | "closed";

export const normalizeState = (state: string): NormalizedState => {
  const s = (state ?? "").toLowerCase();
  if (s.includes("resolved")) return "resolved";
  if (s.includes("closed")) return "closed";
  if (s.includes("done") || s.includes("completed")) return "done";
  if (s.includes("block")) return "blocked";
  if (
    s.includes("active") ||
    s.includes("progress") ||
    s.includes("committed") ||
    s.includes("doing")
  )
    return "active";
  return "pending";
};

export const isBugType = (type: string | undefined): boolean =>
  typeof type === "string" && type.toLowerCase() === "bug";

export const hasWaitingTag = (tags: readonly string[] | null | undefined): boolean => {
  if (!tags || tags.length === 0) return false;
  return tags.some((tag) => typeof tag === "string" && tag.toLowerCase() === "waiting");
};

export interface WipItem {
  state: string;
  type?: string;
}

export interface WipBreakdown {
  activeTasks: number;
  activeBugs: number;
  pendingTasks: number;
  pendingBugs: number;
  total: number;
}

/**
 * WIP counts only work items in "active" (Open / In Progress) or "pending"
 * (New / To Do) states. Done, resolved, closed and blocked items are excluded.
 */
export const computeWip = (items: readonly WipItem[]): WipBreakdown => {
  let activeTasks = 0;
  let activeBugs = 0;
  let pendingTasks = 0;
  let pendingBugs = 0;
  for (const it of items) {
    const norm = normalizeState(it.state);
    if (norm !== "active" && norm !== "pending") continue;
    const bug = isBugType(it.type);
    if (norm === "active") bug ? activeBugs++ : activeTasks++;
    else bug ? pendingBugs++ : pendingTasks++;
  }
  return {
    activeTasks,
    activeBugs,
    pendingTasks,
    pendingBugs,
    total: activeTasks + activeBugs + pendingTasks + pendingBugs,
  };
};
