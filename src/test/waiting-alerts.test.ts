import { describe, expect, it } from "vitest";

import {
  buildDigestSummary,
  buildWeeklyDigestText,
  countByDependency,
  daysSince,
  findStaleWaitingItems,
} from "@/lib/waitingAlerts";
import type { WaitingItem } from "@/lib/waitingGroups";

const now = new Date("2026-03-20T00:00:00Z");

const item = (over: Partial<WaitingItem>): WaitingItem => ({
  id: "1",
  title: "Item",
  state: "Active",
  type: "Task",
  theme: "Theme A",
  tags: ["waiting"],
  ...over,
});

describe("daysSince", () => {
  it("counts whole elapsed days and clamps future dates", () => {
    expect(daysSince("2026-03-01T00:00:00Z", now)).toBe(19);
    expect(daysSince("2026-04-01T00:00:00Z", now)).toBe(0);
    expect(daysSince(undefined, now)).toBeUndefined();
    expect(daysSince("not-a-date", now)).toBeUndefined();
  });
});

describe("findStaleWaitingItems", () => {
  it("keeps only waiting items older than the threshold, oldest first", () => {
    const stale = findStaleWaitingItems(
      [
        item({ id: "fresh", changedDate: "2026-03-18T00:00:00Z" }),
        item({ id: "old", changedDate: "2026-02-01T00:00:00Z" }),
        item({ id: "mid", changedDate: "2026-03-01T00:00:00Z" }),
        item({ id: "not-waiting", tags: ["blocked"], changedDate: "2026-01-01T00:00:00Z" }),
      ],
      16,
      now,
    );
    expect(stale.map((s) => s.id)).toEqual(["old", "mid"]);
    expect(stale[0].staleDays).toBe(47);
  });

  it("treats items without a changed date as stale", () => {
    const stale = findStaleWaitingItems([item({ id: "unknown" })], 16, now);
    expect(stale).toHaveLength(1);
    expect(stale[0].staleDays).toBeUndefined();
  });

  it("reads the dependency from tags", () => {
    const stale = findStaleWaitingItems(
      [item({ tags: ["waiting", "waiting:Customer"], changedDate: "2026-01-01T00:00:00Z" })],
      16,
      now,
    );
    expect(stale[0].dependency).toBe("Customer");
  });
});

describe("countByDependency", () => {
  it("groups by dependency with an unknown bucket", () => {
    const stale = findStaleWaitingItems(
      [
        item({ id: "1", tags: ["waiting", "dep:QA"], changedDate: "2026-01-01T00:00:00Z" }),
        item({ id: "2", tags: ["waiting", "dep:QA"], changedDate: "2026-01-01T00:00:00Z" }),
        item({ id: "3", changedDate: "2026-01-01T00:00:00Z" }),
      ],
      16,
      now,
    );
    expect(countByDependency(stale)).toEqual([
      { dependency: "QA", count: 2 },
      { dependency: "Unknown", count: 1 },
    ]);
  });
});

describe("buildDigestSummary and buildWeeklyDigestText", () => {
  const items = [
    item({ id: "10", assignee: "Ana", tags: ["waiting", "waiting:Customer"], changedDate: "2026-01-05T00:00:00Z" }),
    item({ id: "11", assignee: "Ana", theme: "Theme B", changedDate: "2026-03-19T00:00:00Z" }),
    item({ id: "12", assignee: "Luis", theme: "", changedDate: "2026-02-01T00:00:00Z" }),
    item({ id: "13", tags: ["blocked"] }),
  ];

  it("aggregates the waiting numbers", () => {
    const summary = buildDigestSummary(items, 16, now);
    expect(summary.totalWaiting).toBe(3);
    expect(summary.developersAffected).toBe(2);
    expect(summary.staleCount).toBe(2);
    expect(summary.dependencies[0].count).toBe(1);
  });

  it("renders markdown with links, themes and ages", () => {
    const summary = buildDigestSummary(items, 16, now);
    const text = buildWeeklyDigestText(summary, {
      generatedAt: now,
      thresholdDays: 16,
      workItemUrl: (id) => `https://tfs/_workitems/edit/${id}`,
    });
    expect(text).toContain("# Weekly status digest — 20/03/2026");
    expect(text).toContain("- Waiting items: 3");
    expect(text).toContain("[#10](https://tfs/_workitems/edit/10)");
    expect(text).toContain("waiting on Customer");
    expect(text).toContain("### Ana (1)");
    expect(text).toContain("No theme");
    expect(text).not.toContain("#11");
  });

  it("states clearly when nothing is stale", () => {
    const summary = buildDigestSummary([item({ changedDate: "2026-03-19T00:00:00Z" })], 16, now);
    const text = buildWeeklyDigestText(summary, { generatedAt: now });
    expect(text).toContain("No stale waiting items.");
  });
});
