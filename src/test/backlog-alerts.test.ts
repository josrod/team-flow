import { describe, expect, it } from "vitest";

import { buildBacklogAlerts, countAlertsByKind, groupAlertsByItem } from "@/lib/backlogAlerts";
import type { BacklogCardItem } from "@/lib/backlogBoard";

const card = (overrides: Partial<BacklogCardItem> = {}): BacklogCardItem => ({
  id: 1,
  title: "PBI",
  state: "In Progress",
  column: "inProgress",
  swimlane: "normal",
  workItemType: "Product Backlog Item",
  isBug: false,
  tags: [],
  waiting: false,
  children: [],
  childrenDone: 0,
  htmlUrl: "https://tfs/_workitems/edit/1",
  ...overrides,
});

describe("buildBacklogAlerts", () => {
  it("flags backlog items without any owner", () => {
    const alerts = buildBacklogAlerts([card()]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("unassignedItem");
    expect(alerts[0].severity).toBe("high");
  });

  it("does not flag an item whose child task has an owner", () => {
    const alerts = buildBacklogAlerts([
      card({
        children: [
          {
            id: 2,
            title: "Task",
            state: "Active",
            column: "inProgress",
            workItemType: "Task",
            assignedTo: "Ana Diaz",
            htmlUrl: "",
          },
        ],
      }),
    ]);
    expect(alerts.map((a) => a.kind)).not.toContain("unassignedItem");
  });

  it("flags active child tasks without an owner", () => {
    const alerts = buildBacklogAlerts([
      card({
        assignedTo: "Ana Diaz",
        children: [
          { id: 3, title: "Orphan task", state: "New", column: "open", workItemType: "Task", htmlUrl: "" },
        ],
      }),
    ]);
    expect(alerts.map((a) => a.kind)).toEqual(["unassignedChild"]);
    expect(alerts[0].detail).toBe("PBI");
  });

  it("ignores closed work", () => {
    expect(buildBacklogAlerts([card({ column: "closed", state: "Closed" })])).toHaveLength(0);
  });

  it("flags work whose owner is absent", () => {
    const alerts = buildBacklogAlerts([card({ assignedTo: "Ana Diaz" })], {
      absenceFor: (person) => (person === "Ana Diaz" ? { until: "2026-09-12" } : undefined),
    });
    expect(alerts.map((a) => a.kind)).toEqual(["absentOwner"]);
    expect(alerts[0].detail).toBe("2026-09-12");
  });

  it("flags dependency-blocked work and keeps the other tags as detail", () => {
    const alerts = buildBacklogAlerts([
      card({ assignedTo: "Ana Diaz", tags: ["Waiting", "vendor"], waiting: true }),
    ]);
    expect(alerts.map((a) => a.kind)).toEqual(["dependency"]);
    expect(alerts[0].detail).toBe("vendor");
  });

  it("counts alerts by kind", () => {
    const counts = countAlertsByKind(buildBacklogAlerts([card(), card({ id: 5, tags: ["waiting"] })]));
    expect(counts.unassignedItem).toBe(2);
    expect(counts.dependency).toBe(1);
  });
});

describe("reviews and grouping", () => {
  const blockedCard = {
    id: 10,
    title: "Blocked PBI",
    workItemType: "Product Backlog Item",
    state: "In Progress",
    column: "inProgress",
    tags: ["waiting"],
    children: [],
    childrenDone: 0,
    childrenTotal: 0,
    htmlUrl: "https://tfs/10",
    changedDate: new Date(Date.now() - 5 * 86400000).toISOString(),
  } as unknown as BacklogCardItem;

  it("hides alerts marked as reviewed", () => {
    const alerts = buildBacklogAlerts([blockedCard]);
    expect(alerts.length).toBeGreaterThan(0);
    const hidden = buildBacklogAlerts([blockedCard], {
      reviewed: alerts.map((alert) => ({ itemId: alert.itemId, kind: alert.kind, person: alert.person })),
    });
    expect(hidden).toHaveLength(0);
  });

  it("reports days since the last change", () => {
    const [alert] = buildBacklogAlerts([blockedCard]);
    expect(alert.staleDays).toBe(5);
  });

  it("groups alerts by backlog item", () => {
    const groups = groupAlertsByItem(buildBacklogAlerts([blockedCard]));
    expect(groups).toHaveLength(1);
    expect(groups[0].itemId).toBe(10);
  });
});
