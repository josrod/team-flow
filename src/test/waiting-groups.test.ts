import { describe, expect, it } from "vitest";

import {
  groupWaitingItems,
  latestChangedDate,
  pathLeaf,
  NO_THEME_KEY,
  UNASSIGNED_KEY,
  type WaitingItem,
} from "@/lib/waitingGroups";

const item = (over: Partial<WaitingItem>): WaitingItem => ({
  id: "1",
  title: "Item",
  state: "Active",
  type: "Task",
  theme: "Theme A",
  tags: ["waiting"],
  ...over,
});

describe("waitingGroups", () => {
  it("keeps only items tagged as waiting", () => {
    const groups = groupWaitingItems([
      item({ id: "1", assignee: "Ana" }),
      item({ id: "2", assignee: "Ana", tags: ["blocked"] }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(1);
  });

  it("groups by developer and theme", () => {
    const groups = groupWaitingItems([
      item({ id: "1", assignee: "Ana", theme: "Theme A", title: "B" }),
      item({ id: "2", assignee: "Ana", theme: "Theme A", title: "A" }),
      item({ id: "3", assignee: "Ana", theme: "Theme B" }),
      item({ id: "4", assignee: "Luis", theme: "Theme C" }),
    ]);
    expect(groups[0].developer).toBe("Ana");
    expect(groups[0].total).toBe(3);
    expect(groups[0].themes.map((t) => t.theme)).toEqual(["Theme A", "Theme B"]);
    expect(groups[0].themes[0].items.map((i) => i.title)).toEqual(["A", "B"]);
    expect(groups[1].developer).toBe("Luis");
  });

  it("buckets missing assignee and theme, sorting them last", () => {
    const groups = groupWaitingItems([
      item({ id: "1", assignee: "Ana", theme: "" }),
      item({ id: "2", assignee: "Ana", theme: "Theme A" }),
      item({ id: "3" }),
    ]);
    expect(groups[groups.length - 1].developer).toBe(UNASSIGNED_KEY);
    const ana = groups.find((g) => g.developer === "Ana");
    expect(ana?.themes[ana.themes.length - 1].theme).toBe(NO_THEME_KEY);
  });

  it("detects the latest changed date and path leaves", () => {
    expect(
      latestChangedDate([
        item({ changedDate: "2026-01-01T00:00:00Z" }),
        item({ changedDate: "2026-03-01T00:00:00Z" }),
        item({}),
      ]),
    ).toBe("2026-03-01T00:00:00Z");
    expect(latestChangedDate([item({})])).toBeUndefined();
    expect(pathLeaf("SDES\\Rodat\\4.4")).toBe("4.4");
    expect(pathLeaf(undefined)).toBeUndefined();
  });
});

describe("extractWaitingDependency", () => {
  it("reads the dependency from prefixed tags", async () => {
    const { extractWaitingDependency } = await import("@/lib/waitingGroups");
    expect(extractWaitingDependency(["waiting", "waiting:Customer"])).toBe("Customer");
    expect(extractWaitingDependency(["Blocked-By: QA team"])).toBe("QA team");
    expect(extractWaitingDependency(["dep:Vendor"])).toBe("Vendor");
  });

  it("returns undefined when no dependency is declared", async () => {
    const { extractWaitingDependency } = await import("@/lib/waitingGroups");
    expect(extractWaitingDependency(["waiting"])).toBeUndefined();
    expect(extractWaitingDependency(["waiting:"])).toBeUndefined();
    expect(extractWaitingDependency(undefined)).toBeUndefined();
  });
});
