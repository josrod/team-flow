import { describe, expect, it } from "vitest";

import { buildPersonPanel, sortPersonRows, absenceDaysInWeek } from "@/lib/personPanel";
import type { BacklogCardItem } from "@/lib/backlogBoard";

const card = (overrides: Partial<BacklogCardItem>): BacklogCardItem => ({
  id: 1,
  title: "Item",
  state: "Active",
  column: "inProgress",
  swimlane: "normal",
  workItemType: "Product Backlog Item",
  isBug: false,
  tags: [],
  waiting: false,
  children: [],
  childrenDone: 0,
  childrenTotal: 0,
  htmlUrl: "",
  ...overrides,
});

const members = [
  { id: "m1", name: "Ana Ruiz", teamId: "rodat" },
  { id: "m2", name: "Luis Gomez", teamId: "processing" },
];

const memberIdFor = (person: string): string | null =>
  members.find((member) => member.name.toLowerCase() === person.toLowerCase())?.id ?? null;

// Week 2026-W10 runs Mon 2026-03-02 to Sun 2026-03-08.
const weekKey = "2026-W10";

describe("buildPersonPanel", () => {
  it("aggregates items, progress, hours, absences and blockers per member", () => {
    const result = buildPersonPanel({
      members,
      weekKey,
      memberIdFor,
      cards: [
        card({ id: 10, assignedTo: "Ana Ruiz", childrenDone: 1, childrenTotal: 4 }),
        card({
          id: 11,
          assignedTo: "Ana Ruiz",
          column: "closed",
          state: "Closed",
          closedDate: "2026-03-04T10:00:00Z",
        }),
        card({ id: 12, assignedTo: "Luis Gomez", waiting: true, tags: ["waiting"] }),
      ],
      alerts: [{ itemId: 12, kind: "dependency", person: "Luis Gomez" }],
      bookings: [
        { person: "Ana Ruiz", memberId: "m1", workDate: "2026-03-03", duration: 8 },
        { person: "Ana Ruiz", memberId: "m1", workDate: "2026-02-24", duration: 6 },
        { person: "Luis Gomez", memberId: null, workDate: "2026-03-05", duration: 4 },
      ],
      absences: [
        { memberId: "m2", type: "vacation", startDate: "2026-03-02", endDate: "2026-03-03" },
      ],
    });

    const ana = result.rows.find((row) => row.memberId === "m1");
    const luis = result.rows.find((row) => row.memberId === "m2");

    expect(result.weekFrom).toBe("2026-03-02");
    expect(result.weekTo).toBe("2026-03-08");
    expect(ana?.itemsTotal).toBe(2);
    expect(ana?.itemsActive).toBe(1);
    expect(ana?.itemsClosedInWeek).toBe(1);
    expect(ana?.progressPercent).toBe(25);
    expect(ana?.hours).toBe(8);
    expect(ana?.hoursPreviousWeek).toBe(6);
    expect(ana?.hoursDelta).toBe(2);
    expect(ana?.blockers).toBe(0);

    expect(luis?.hours).toBe(4);
    expect(luis?.absenceDays).toBe(2);
    expect(luis?.absenceTypes).toEqual(["vacation"]);
    expect(luis?.blockers).toBe(1);
    expect(luis?.waiting).toBe(1);

    expect(result.kpis.hours).toBe(12);
    expect(result.kpis.closedItems).toBe(1);
    expect(result.kpis.blockers).toBe(1);
  });

  it("attributes items without an owner to the owners of their child tasks", () => {
    const result = buildPersonPanel({
      members,
      weekKey,
      memberIdFor,
      cards: [
        card({
          id: 20,
          assignedTo: undefined,
          childrenTotal: 2,
          childrenDone: 1,
          children: [
            { id: 21, title: "a", state: "Closed", column: "closed", workItemType: "Task", assignedTo: "Luis Gomez", htmlUrl: "" },
            { id: 22, title: "b", state: "Active", column: "inProgress", workItemType: "Task", assignedTo: "Luis Gomez", htmlUrl: "" },
          ],
        }),
      ],
      alerts: [],
      bookings: [],
      absences: [],
    });

    expect(result.rows.find((row) => row.memberId === "m2")?.itemsActive).toBe(1);
    expect(result.rows.find((row) => row.memberId === "m1")?.itemsActive).toBe(0);
  });

  it("flags people with active work and no booked hours as high risk", () => {
    const result = buildPersonPanel({
      members: [members[0]],
      weekKey,
      memberIdFor,
      cards: [card({ id: 30, assignedTo: "Ana Ruiz", childrenTotal: 2, childrenDone: 0 })],
      alerts: [],
      bookings: [],
      absences: [],
    });

    expect(result.rows[0].risk).toBe("high");
    expect(result.kpis.atRisk).toBe(1);
  });

  it("plans capacity from absences, sums TFS estimates and flags deviation", () => {
    const result = buildPersonPanel({
      members,
      weekKey,
      memberIdFor,
      cards: [
        card({
          id: 50,
          assignedTo: "Ana Ruiz",
          childrenTotal: 2,
          childrenDone: 0,
          children: [
            { id: 51, title: "a", state: "Active", column: "inProgress", workItemType: "Task", assignedTo: "Ana Ruiz", originalEstimate: 12, htmlUrl: "" },
            { id: 52, title: "b", state: "Active", column: "open", workItemType: "Task", assignedTo: "Ana Ruiz", remainingWork: 3, htmlUrl: "" },
          ],
        }),
        card({ id: 53, assignedTo: "Luis Gomez" }),
      ],
      alerts: [],
      bookings: [
        { person: "Ana Ruiz", memberId: "m1", workDate: "2026-03-03", duration: 40 },
        { person: "Luis Gomez", memberId: "m2", workDate: "2026-03-03", duration: 12 },
      ],
      absences: [
        { memberId: "m2", type: "vacation", startDate: "2026-03-02", endDate: "2026-03-03" },
      ],
    });

    const ana = result.rows.find((row) => row.memberId === "m1");
    const luis = result.rows.find((row) => row.memberId === "m2");

    expect(ana?.plannedCapacityHours).toBe(40);
    expect(ana?.plannedEstimateHours).toBe(15);
    expect(ana?.weeklyProgressPercent).toBe(100);
    expect(ana?.deviationFlag).toBe("ok");

    expect(luis?.plannedCapacityHours).toBe(24);
    expect(luis?.plannedEstimateHours).toBe(0);
    expect(luis?.deviationHours).toBe(-12);
    expect(luis?.deviationPercent).toBe(-50);
    expect(luis?.deviationFlag).toBe("under");

    expect(result.kpis.plannedCapacityHours).toBe(64);
    expect(result.kpis.plannedEstimateHours).toBe(15);
    expect(result.kpis.deviating).toBe(1);
  });

  it("flags booked hours above the plan as over", () => {
    const result = buildPersonPanel({
      members: [members[0]],
      weekKey,
      memberIdFor,
      cards: [card({ id: 60, assignedTo: "Ana Ruiz" })],
      alerts: [],
      bookings: [{ person: "Ana Ruiz", memberId: "m1", workDate: "2026-03-03", duration: 50 }],
      absences: [],
    });

    expect(result.rows[0].deviationFlag).toBe("over");
    expect(result.rows[0].deviationPercent).toBe(25);
  });
});

describe("absenceDaysInWeek", () => {
  it("counts only working days inside the week", () => {
    const { days } = absenceDaysInWeek(
      [{ memberId: "m1", type: "vacation", startDate: "2026-02-27", endDate: "2026-03-10" }],
      "2026-03-02",
      "2026-03-08",
    );
    expect(days).toBe(5);
  });
});

describe("sortPersonRows", () => {
  it("puts the lowest progress first when sorting by progress", () => {
    const rows = buildPersonPanel({
      members,
      weekKey,
      memberIdFor,
      cards: [
        card({ id: 40, assignedTo: "Ana Ruiz", childrenTotal: 2, childrenDone: 2 }),
        card({ id: 41, assignedTo: "Luis Gomez", childrenTotal: 4, childrenDone: 1 }),
      ],
      alerts: [],
      bookings: [],
      absences: [],
    }).rows;

    expect(sortPersonRows(rows, "progress")[0].memberId).toBe("m2");
    expect(sortPersonRows(rows, "name")[0].name).toBe("Ana Ruiz");
    expect(sortPersonRows(rows, "deviation").length).toBe(2);
  });
});
