import { describe, it, expect } from "vitest";
import {
  buildBacklogCards,
  countByColumn,
  groupByPerson,
  groupIntoBoard,
  isRecentlyClosed,
  toBoardColumn,
  toSwimlane,
  parseTags,
  UNASSIGNED_KEY,
} from "@/lib/backlogBoard";
import type { TfsWorkItem } from "@/services/tfs";

const pbi = (over: Partial<TfsWorkItem> & { id: number }): TfsWorkItem => ({
  title: `Item ${over.id}`,
  state: "Open",
  workItemType: "Product Backlog Item",
  ...over,
});

describe("toBoardColumn", () => {
  it("maps TFS states to the five board columns", () => {
    expect(toBoardColumn("Open")).toBe("open");
    expect(toBoardColumn("New")).toBe("open");
    expect(toBoardColumn("In Refinement")).toBe("refinement");
    expect(toBoardColumn("In Progress")).toBe("inProgress");
    expect(toBoardColumn("In Testing")).toBe("testing");
    expect(toBoardColumn("Closed")).toBe("closed");
    expect(toBoardColumn("Resolved")).toBe("closed");
    expect(toBoardColumn("")).toBe("open");
  });
});

describe("swimlanes", () => {
  it("detects unplanned work from tags", () => {
    expect(toSwimlane(parseTags("RODAT; Unplanned"))).toBe("unplanned");
    expect(toSwimlane(parseTags("RODAT; Waiting"))).toBe("normal");
    expect(toSwimlane([])).toBe("normal");
  });
});

describe("isRecentlyClosed", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  it("keeps closed items inside the 10 day window", () => {
    expect(isRecentlyClosed({ state: "Closed", closedDate: "2026-09-01T10:00:00Z" }, now)).toBe(true);
    expect(isRecentlyClosed({ state: "Closed", closedDate: "2026-08-01T10:00:00Z" }, now)).toBe(false);
  });
  it("ignores active items and missing dates", () => {
    expect(isRecentlyClosed({ state: "In Progress", closedDate: "2026-09-06T10:00:00Z" }, now)).toBe(false);
    expect(isRecentlyClosed({ state: "Closed" }, now)).toBe(false);
  });
});

describe("buildBacklogCards", () => {
  const items = [
    pbi({ id: 1, state: "In Progress", assignedTo: "Ana", tags: "RODAT; Waiting" }),
    pbi({ id: 2, state: "Open", workItemType: "Bug", tags: "Unplanned" }),
  ];
  const children: TfsWorkItem[] = [
    { id: 11, title: "T1", state: "Closed", workItemType: "Task", parentId: 1, assignedTo: "Ana" },
    { id: 12, title: "T2", state: "In Progress", workItemType: "Task", parentId: 1, assignedTo: "Beto" },
    { id: 21, title: "T3", state: "Open", workItemType: "Task", parentId: 2, assignedTo: "Beto" },
  ];

  it("nests children and counts the completed ones", () => {
    const cards = buildBacklogCards(items, children, "https://tfs/x/SDES");
    expect(cards[0].children).toHaveLength(2);
    expect(cards[0].childrenDone).toBe(1);
    expect(cards[0].waiting).toBe(true);
    expect(cards[0].htmlUrl).toBe("https://tfs/x/SDES/_workitems/edit/1");
    expect(cards[1].isBug).toBe(true);
    expect(cards[1].swimlane).toBe("unplanned");
  });

  it("groups into swimlanes and columns", () => {
    const cards = buildBacklogCards(items, children);
    const grid = groupIntoBoard(cards);
    expect(grid.normal.inProgress.map((c) => c.id)).toEqual([1]);
    expect(grid.unplanned.open.map((c) => c.id)).toEqual([2]);
    expect(countByColumn(cards)).toMatchObject({ inProgress: 1, open: 1, closed: 0 });
  });

  it("attributes unassigned PBIs to the owners of their child tasks", () => {
    const cards = buildBacklogCards(items, children);
    const groups = groupByPerson(cards);
    const people = groups.map((g) => g.person);
    expect(people).toContain("Ana");
    expect(people).toContain("Beto");
    expect(people).not.toContain(UNASSIGNED_KEY);
  });

  it("falls back to unassigned when nobody owns the work", () => {
    const cards = buildBacklogCards([pbi({ id: 9 })], []);
    expect(groupByPerson(cards)[0].person).toBe(UNASSIGNED_KEY);
  });
});
