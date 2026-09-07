// Pure logic for the "Backlog items" board: state → column mapping, swimlane
// detection, PBI ↔ child task aggregation and per-person aggregation.
// Kept free of React so it can be unit-tested in isolation.

import type { TfsWorkItem } from "@/services/tfs";

export type BoardColumn = "open" | "refinement" | "inProgress" | "testing" | "closed";

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  "open",
  "refinement",
  "inProgress",
  "testing",
  "closed",
] as const;

export type Swimlane = "unplanned" | "normal";

/** Tag (case-insensitive) that marks a backlog item as unplanned work. */
export const UNPLANNED_TAG = "unplanned";

/** Days a closed/done item stays visible on the board. */
export const CLOSED_WINDOW_DAYS = 10;

/** Maps any TFS state string to one of the five board columns. */
export const toBoardColumn = (state: string): BoardColumn => {
  const s = (state ?? "").trim().toLowerCase();
  if (!s) return "open";
  if (s.includes("refinement")) return "refinement";
  if (s.includes("test")) return "testing";
  if (
    s.includes("closed") ||
    s.includes("done") ||
    s.includes("completed") ||
    s.includes("resolved") ||
    s.includes("cut")
  ) {
    return "closed";
  }
  if (s.includes("progress") || s.includes("active") || s.includes("committed") || s.includes("doing")) {
    return "inProgress";
  }
  return "open";
};

/** Splits the raw `System.Tags` string ("a; b") into a trimmed array. */
export const parseTags = (tags: string | undefined | null): string[] =>
  typeof tags === "string" && tags.trim().length > 0
    ? tags.split(";").map((tag) => tag.trim()).filter(Boolean)
    : [];

export const hasTag = (tags: readonly string[], tag: string): boolean =>
  tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());

export const toSwimlane = (tags: readonly string[]): Swimlane =>
  hasTag(tags, UNPLANNED_TAG) ? "unplanned" : "normal";

/** True when a closed/done item changed inside the recent visibility window. */
export const isRecentlyClosed = (
  item: Pick<TfsWorkItem, "state" | "closedDate" | "changedDate">,
  now: Date = new Date(),
  windowDays: number = CLOSED_WINDOW_DAYS,
): boolean => {
  if (toBoardColumn(item.state) !== "closed") return false;
  const iso = item.closedDate ?? item.changedDate;
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000;
  return diffDays <= windowDays;
};

export interface BacklogChild {
  id: number;
  title: string;
  state: string;
  column: BoardColumn;
  workItemType: string;
  assignedTo?: string;
  assignedToEmail?: string;
  originalEstimate?: number;
  remainingWork?: number;
  completedWork?: number;
  htmlUrl: string;
}

export interface BacklogCardItem {
  id: number;
  title: string;
  state: string;
  column: BoardColumn;
  swimlane: Swimlane;
  workItemType: string;
  isBug: boolean;
  assignedTo?: string;
  assignedToEmail?: string;
  iterationPath?: string;
  areaPath?: string;
  tags: string[];
  waiting: boolean;
  changedDate?: string;
  closedDate?: string;
  children: BacklogChild[];
  /** Child tasks already in a closed/done column. */
  childrenDone: number;
  /** Total number of child tasks. */
  childrenTotal: number;
  htmlUrl: string;
}

const buildHtmlUrl = (baseUrl: string | null, id: number): string =>
  baseUrl ? `${baseUrl.replace(/\/+$/, "")}/_workitems/edit/${id}` : "";

/** Builds board cards from raw PBIs/bugs plus their child work items. */
export const buildBacklogCards = (
  items: readonly TfsWorkItem[],
  children: readonly TfsWorkItem[],
  baseUrl: string | null = null,
): BacklogCardItem[] => {
  const childrenByParent = new Map<number, BacklogChild[]>();
  children.forEach((child) => {
    if (child.parentId === undefined) return;
    const list = childrenByParent.get(child.parentId) ?? [];
    list.push({
      id: child.id,
      title: child.title,
      state: child.state,
      column: toBoardColumn(child.state),
      workItemType: child.workItemType,
      assignedTo: child.assignedTo,
      assignedToEmail: child.assignedToEmail,
      originalEstimate: child.originalEstimate,
      remainingWork: child.remainingWork,
      completedWork: child.completedWork,
      htmlUrl: buildHtmlUrl(baseUrl, child.id),
    });
    childrenByParent.set(child.parentId, list);
  });

  return items.map((item) => {
    const tags = parseTags(item.tags);
    const kids = (childrenByParent.get(item.id) ?? []).slice().sort((a, b) => a.id - b.id);
    return {
      id: item.id,
      title: item.title,
      state: item.state,
      column: toBoardColumn(item.state),
      swimlane: toSwimlane(tags),
      workItemType: item.workItemType,
      isBug: item.workItemType.trim().toLowerCase() === "bug",
      assignedTo: item.assignedTo,
      assignedToEmail: item.assignedToEmail,
      iterationPath: item.iterationPath,
      areaPath: item.areaPath,
      tags,
      waiting: hasTag(tags, "waiting"),
      changedDate: item.changedDate,
      closedDate: item.closedDate,
      children: kids,
      childrenDone: kids.filter((c) => c.column === "closed").length,
      childrenTotal: kids.length,
      htmlUrl: buildHtmlUrl(baseUrl, item.id),
    };
  });
};

export type BoardGrid = Record<Swimlane, Record<BoardColumn, BacklogCardItem[]>>;

const emptyColumns = (): Record<BoardColumn, BacklogCardItem[]> => ({
  open: [],
  refinement: [],
  inProgress: [],
  testing: [],
  closed: [],
});

/** Groups cards into the swimlane × column grid used by the board view. */
export const groupIntoBoard = (cards: readonly BacklogCardItem[]): BoardGrid => {
  const grid: BoardGrid = { unplanned: emptyColumns(), normal: emptyColumns() };
  cards.forEach((card) => {
    grid[card.swimlane][card.column].push(card);
  });
  return grid;
};

export const countByColumn = (cards: readonly BacklogCardItem[]): Record<BoardColumn, number> => {
  const counts: Record<BoardColumn, number> = {
    open: 0,
    refinement: 0,
    inProgress: 0,
    testing: 0,
    closed: 0,
  };
  cards.forEach((card) => {
    counts[card.column] += 1;
  });
  return counts;
};

export interface PersonGroup {
  person: string;
  cards: BacklogCardItem[];
  inProgress: number;
  activeChildren: number;
  waiting: number;
  hasActiveWork: boolean;
}

export const UNASSIGNED_KEY = "__unassigned__";

/**
 * Groups cards per assignee. A card is attributed to its own assignee; when the
 * PBI itself has no assignee, the people working on its child tasks are used.
 * People without active work are flagged so the UI can push them to the end.
 */
export const groupByPerson = (cards: readonly BacklogCardItem[]): PersonGroup[] => {
  const byPerson = new Map<string, BacklogCardItem[]>();
  const push = (person: string, card: BacklogCardItem) => {
    const list = byPerson.get(person) ?? [];
    if (!list.some((existing) => existing.id === card.id)) list.push(card);
    byPerson.set(person, list);
  };

  cards.forEach((card) => {
    if (card.assignedTo && card.assignedTo.trim()) {
      push(card.assignedTo.trim(), card);
      return;
    }
    const childOwners = Array.from(
      new Set(card.children.map((c) => c.assignedTo?.trim()).filter((n): n is string => !!n)),
    );
    if (childOwners.length === 0) {
      push(UNASSIGNED_KEY, card);
      return;
    }
    childOwners.forEach((owner) => push(owner, card));
  });

  const groups: PersonGroup[] = Array.from(byPerson.entries()).map(([person, list]) => {
    const inProgress = list.filter((c) => c.column === "inProgress").length;
    const activeChildren = list.reduce(
      (acc, card) =>
        acc +
        card.children.filter(
          (child) =>
            (child.column === "inProgress" || child.column === "open" || child.column === "refinement") &&
            (!card.assignedTo || !child.assignedTo || child.assignedTo.trim() === person || card.assignedTo.trim() === person),
        ).length,
      0,
    );
    const waiting = list.filter((c) => c.waiting).length;
    const hasActiveWork = list.some((c) => c.column !== "closed");
    return { person, cards: list, inProgress, activeChildren, waiting, hasActiveWork };
  });

  return groups.sort((a, b) => {
    if (a.person === UNASSIGNED_KEY) return 1;
    if (b.person === UNASSIGNED_KEY) return -1;
    if (a.hasActiveWork !== b.hasActiveWork) return a.hasActiveWork ? -1 : 1;
    if (b.inProgress !== a.inProgress) return b.inProgress - a.inProgress;
    return a.person.localeCompare(b.person);
  });
};

/**
 * Completion of a backlog item: closed child tasks over total child tasks.
 * Returns `null` when the item has no child tasks, so the UI can say
 * "no child tasks" instead of showing a misleading 0%.
 */
export const completionRatio = (
  card: Pick<BacklogCardItem, "childrenDone" | "childrenTotal">,
): number | null => (card.childrenTotal > 0 ? card.childrenDone / card.childrenTotal : null);

/** Completion as a rounded percentage, or `null` without child tasks. */
export const completionPercent = (
  card: Pick<BacklogCardItem, "childrenDone" | "childrenTotal">,
): number | null => {
  const ratio = completionRatio(card);
  return ratio === null ? null : Math.round(ratio * 100);
};

export interface BacklogProgressSummary {
  /** Average completion of active (non closed) items that have child tasks. */
  averagePercent: number | null;
  /** Active items whose child tasks are all done — candidates to be closed. */
  readyToClose: number;
}

export const summarizeProgress = (
  cards: readonly BacklogCardItem[],
): BacklogProgressSummary => {
  const active = cards.filter((card) => card.column !== "closed" && card.childrenTotal > 0);
  const readyToClose = active.filter((card) => card.childrenDone === card.childrenTotal).length;
  if (active.length === 0) return { averagePercent: null, readyToClose };
  const total = active.reduce((sum, card) => sum + (completionRatio(card) ?? 0), 0);
  return { averagePercent: Math.round((total / active.length) * 100), readyToClose };
};
