// Pure alert logic for the dashboard: detects backlog items and child tasks
// without an owner, work blocked because its owner is absent, and work blocked
// by an external dependency (the "waiting" tag). Kept React-free for testing.

import type { BacklogCardItem } from "@/lib/backlogBoard";

export type BacklogAlertKind = "unassignedItem" | "unassignedChild" | "absentOwner" | "dependency";

export type BacklogAlertSeverity = "high" | "medium";

export interface BacklogAlert {
  id: string;
  kind: BacklogAlertKind;
  severity: BacklogAlertSeverity;
  itemId: number;
  title: string;
  workItemType: string;
  state: string;
  /** Owner of the work item, when known. */
  person?: string;
  /** Extra context: child task title, absence end date or dependency tags. */
  detail?: string;
  htmlUrl: string;
  /** Days since the item last changed in Azure DevOps. */
  staleDays?: number;
  /** Parent backlog item, set on child-task alerts. */
  parentItemId?: number;
}

export interface AbsentOwner {
  /** Absence type key, e.g. "vacation". */
  type?: string;
  /** Last day of the absence (ISO date). */
  until?: string;
}

export interface BlockerReviewKey {
  itemId: number;
  kind: BacklogAlertKind;
  person?: string | null;
}

export interface BacklogAlertOptions {
  /** Returns absence info when the given assignee is currently away. */
  absenceFor?: (person: string) => AbsentOwner | undefined;
  /** Tags that mark an external dependency. Defaults to ["waiting"]. */
  dependencyTags?: readonly string[];
  /** Active "reviewed" marks: matching alerts are hidden. */
  reviewed?: readonly BlockerReviewKey[];
}

const ACTIVE_COLUMNS = new Set(["open", "refinement", "inProgress", "testing"]);

const isActive = (column: string): boolean => ACTIVE_COLUMNS.has(column);

/** Whole days since the given ISO date, or undefined when unknown. */
export const daysSince = (iso: string | undefined, now: Date = new Date()): number | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
};

const sameKey = (alert: BacklogAlert, key: BlockerReviewKey): boolean =>
  alert.itemId === key.itemId &&
  alert.kind === key.kind &&
  (key.person ?? "").trim().toLowerCase() === (alert.person ?? "").trim().toLowerCase();

/**
 * Builds the dashboard alert list from live backlog cards. Only active work is
 * considered; closed items never raise alerts.
 */
export const buildBacklogAlerts = (
  cards: readonly BacklogCardItem[],
  { absenceFor, dependencyTags = ["waiting"], reviewed = [] }: BacklogAlertOptions = {},
): BacklogAlert[] => {
  const alerts: BacklogAlert[] = [];

  cards.forEach((card) => {
    if (!isActive(card.column)) return;
    const staleDays = daysSince(card.changedDate);
    const owner = card.assignedTo?.trim();

    // 1. Backlog item without an owner (nobody on the item nor on its children).
    const childOwners = card.children
      .filter((child) => isActive(child.column))
      .map((child) => child.assignedTo?.trim())
      .filter((name): name is string => !!name);
    if (!owner && childOwners.length === 0) {
      alerts.push({
        id: `unassigned-item-${card.id}`,
        kind: "unassignedItem",
        severity: "high",
        itemId: card.id,
        title: card.title,
        workItemType: card.workItemType,
        state: card.state,
        htmlUrl: card.htmlUrl,
        staleDays,
      });
    }

    // 2. Active child tasks without an owner.
    card.children
      .filter((child) => isActive(child.column) && !child.assignedTo?.trim())
      .forEach((child) => {
        alerts.push({
          id: `unassigned-child-${child.id}`,
          kind: "unassignedChild",
          severity: "medium",
          itemId: child.id,
          title: child.title,
          workItemType: child.workItemType,
          state: child.state,
          detail: card.title,
          htmlUrl: child.htmlUrl || card.htmlUrl,
          staleDays,
          parentItemId: card.id,
        });
      });

    // 3. Owner currently absent while the work is in progress or open.
    const ownersToCheck = owner ? [owner] : Array.from(new Set(childOwners));
    ownersToCheck.forEach((person) => {
      const absence = absenceFor?.(person);
      if (!absence) return;
      alerts.push({
        id: `absent-${card.id}-${person}`,
        kind: "absentOwner",
        severity: card.column === "inProgress" ? "high" : "medium",
        itemId: card.id,
        title: card.title,
        workItemType: card.workItemType,
        state: card.state,
        person,
        detail: absence.until,
        htmlUrl: card.htmlUrl,
        staleDays,
      });
    });

    // 4. Blocked by an external dependency.
    const blockingTags = card.tags.filter((tag) =>
      dependencyTags.some((dependency) => dependency.toLowerCase() === tag.toLowerCase()),
    );
    if (blockingTags.length > 0) {
      const otherTags = card.tags.filter((tag) => !blockingTags.includes(tag));
      alerts.push({
        id: `dependency-${card.id}`,
        kind: "dependency",
        severity: card.column === "inProgress" ? "high" : "medium",
        itemId: card.id,
        title: card.title,
        workItemType: card.workItemType,
        state: card.state,
        person: owner,
        detail: otherTags.join(", ") || undefined,
        htmlUrl: card.htmlUrl,
        staleDays,
      });
    }
  });

  const visible =
    reviewed.length === 0
      ? alerts
      : alerts.filter((alert) => !reviewed.some((key) => sameKey(alert, key)));

  return visible.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.itemId - b.itemId;
  });
};

export const countAlertsByKind = (
  alerts: readonly BacklogAlert[],
): Record<BacklogAlertKind, number> => {
  const counts: Record<BacklogAlertKind, number> = {
    unassignedItem: 0,
    unassignedChild: 0,
    absentOwner: 0,
    dependency: 0,
  };
  alerts.forEach((alert) => {
    counts[alert.kind] += 1;
  });
  return counts;
};

export interface BacklogAlertGroup {
  itemId: number;
  title: string;
  workItemType: string;
  state: string;
  htmlUrl: string;
  alerts: BacklogAlert[];
  /** Highest severity inside the group. */
  severity: BacklogAlertSeverity;
}

/** Groups alerts by backlog item so the blockers page can show one card per PBI. */
export const groupAlertsByItem = (alerts: readonly BacklogAlert[]): BacklogAlertGroup[] => {
  const groups = new Map<number, BacklogAlertGroup>();
  alerts.forEach((alert) => {
    // Child-task alerts carry the parent title in `detail`.
    const key = alert.parentItemId ?? alert.itemId;
    const isChild = alert.parentItemId !== undefined;
    const existing = groups.get(key);
    if (existing) {
      existing.alerts.push(alert);
      if (alert.severity === "high") existing.severity = "high";
      return;
    }
    groups.set(key, {
      itemId: key,
      title: isChild ? (alert.detail ?? alert.title) : alert.title,
      workItemType: alert.workItemType,
      state: alert.state,
      htmlUrl: alert.htmlUrl,
      alerts: [alert],
      severity: alert.severity,
    });
  });
  return Array.from(groups.values()).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    if (a.alerts.length !== b.alerts.length) return b.alerts.length - a.alerts.length;
    return a.itemId - b.itemId;
  });
};
