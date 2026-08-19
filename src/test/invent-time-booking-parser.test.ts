import { describe, expect, it } from "vitest";
import { asIsoDate, asNumber, asOptionalInt, formatHours } from "@/lib/inventValues";
import { parseTimeBookingMatrix } from "@/services/inventTimeBookingParser";
import { parseInventAbsentMatrix } from "@/services/inventAbsentParser";
import {
  filterTimeBookings,
  hoursByPerson,
  summarizeTimeBookings,
  type TimeBooking,
} from "@/services/timeBookingService";
import type { TeamMember } from "@/types";

const HEADER = ["Work date", "Person", "Booking", "Duration"];

const bookingRow = (over: Record<number, unknown> = {}): unknown[] => {
  const row: unknown[] = new Array(19).fill(null);
  row[0] = "01/03/2026";
  row[1] = "jdoe";
  row[2] = 4711;
  row[3] = "8,50";
  row[4] = "ROSEN";
  row[5] = "I-0515-02943";
  row[6] = "Pipeline analysis";
  row[9] = "Engineering";
  row[10] = "Project";
  row[11] = "Billable";
  row[12] = "";
  row[17] = 0;
  row[18] = 0;
  for (const [index, value] of Object.entries(over)) row[Number(index)] = value;
  return row;
};

describe("inventValues", () => {
  it("parses European decimals and Excel serials", () => {
    expect(asNumber("8,50")).toBe(8.5);
    expect(asNumber("nope")).toBe(0);
    expect(asIsoDate(46082)).toBe("2026-03-01");
    expect(asIsoDate("01.03.2026")).toBe("2026-03-01");
    expect(asIsoDate("2026-03-01")).toBe("2026-03-01");
    expect(asIsoDate("")).toBeNull();
  });

  it("treats 0 and blank as absent optional integers", () => {
    expect(asOptionalInt(0)).toBeUndefined();
    expect(asOptionalInt("")).toBeUndefined();
    expect(asOptionalInt("12,9")).toBe(12);
  });

  it("formats hours with a decimal comma", () => {
    expect(formatHours(8.5)).toBe("8,50 h");
  });
});

describe("parseTimeBookingMatrix", () => {
  it("maps columns by position and counts distinct persons and projects", () => {
    const result = parseTimeBookingMatrix(
      [HEADER, bookingRow(), bookingRow({ 1: "asmith", 5: "I-0515-09999", 17: 55, 18: 2 })],
      "tb.xlsx"
    );
    expect(result.items).toHaveLength(2);
    expect(result.persons).toBe(2);
    expect(result.projects).toBe(2);
    const [first, second] = result.items;
    expect(first).toMatchObject({
      workDate: "2026-03-01",
      person: "jdoe",
      duration: 8.5,
      projectCode: "I-0515-02943",
      activityKind: "Engineering",
    });
    expect(first.deliveryNo).toBeUndefined();
    expect(first.remarks).toBeUndefined();
    expect(second.deliveryNo).toBe(55);
    expect(second.deliveryPosition).toBe(2);
  });

  it("skips empty rows silently and warns on incomplete ones", () => {
    const result = parseTimeBookingMatrix(
      [HEADER, new Array(19).fill(null), bookingRow({ 5: "" }), bookingRow()],
      "tb.xlsx"
    );
    expect(result.items).toHaveLength(1);
    expect(result.warnings).toEqual(["3|missingCore"]);
  });
});

describe("parseInventAbsentMatrix", () => {
  const members: TeamMember[] = [
    {
      id: "m1",
      teamId: "t1",
      name: "Jane Doe",
      role: "Engineer",
      loginName: "jdoe",
    } as TeamMember,
  ];

  const absenceRow = (date: unknown, person: string, duration: unknown, kind: string) => [
    null,
    date,
    person,
    duration,
    kind,
  ];

  it("groups consecutive days, sums hours and collects activities", () => {
    const result = parseInventAbsentMatrix(
      [
        HEADER,
        absenceRow("02/03/2026", "jdoe", "8", "Vacation"),
        absenceRow("03/03/2026", "jdoe", "4,5", "Vacation"),
      ],
      members
    );
    expect(result.absences).toHaveLength(1);
    expect(result.absences[0]).toMatchObject({
      memberId: "m1",
      type: "vacation",
      startDate: "2026-03-02",
      endDate: "2026-03-03",
      hours: 12.5,
      activities: ["Vacation"],
    });
    expect(result.warnings).toHaveLength(0);
  });

  it("ignores non-absence activity kinds including home office", () => {
    const result = parseInventAbsentMatrix(
      [
        HEADER,
        absenceRow("02/03/2026", "jdoe", "8", "Home Office"),
        absenceRow("03/03/2026", "jdoe", "8", "Public Holiday"),
      ],
      members
    );
    expect(result.absences).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });

  it("warns with the Excel row number when mandatory values are missing", () => {
    const result = parseInventAbsentMatrix(
      [HEADER, absenceRow("02/03/2026", "", "8", "Vacation")],
      members
    );
    expect(result.warnings).toEqual(["2|absenceMissingCore"]);
  });

  it("reports unmatched logins with their ranges", () => {
    const result = parseInventAbsentMatrix(
      [HEADER, absenceRow("02/03/2026", "unknown.user", "8", "Vacation")],
      members
    );
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].ranges[0]).toMatchObject({ type: "vacation", hours: 8 });
  });
});

describe("timeBookingService aggregation", () => {
  const base: TimeBooking = {
    id: "1",
    workDate: "2026-03-02",
    person: "jdoe",
    memberId: "m1",
    bookingNo: 1,
    duration: 8,
    organization: "ROSEN",
    projectCode: "I-1",
    taskName: "Task A",
    activityKind: "Engineering",
    activityGroup: "Project",
    activityType: "Billable",
    remarks: null,
    deliveryNo: 10,
    deliveryPosition: null,
  };
  const bookings: TimeBooking[] = [
    base,
    { ...base, id: "2", person: "asmith", duration: 4, projectCode: "I-2", workDate: "2026-03-10", deliveryNo: 20 },
  ];

  it("summarizes and groups hours", () => {
    expect(summarizeTimeBookings(bookings)).toEqual({ hours: 12, bookings: 2, persons: 2, projects: 2 });
    expect(hoursByPerson(bookings)[0]).toMatchObject({ label: "jdoe", hours: 8 });
  });

  it("filters by partial text, exact delivery and inclusive date range", () => {
    expect(filterTimeBookings(bookings, { person: "SMI" })).toHaveLength(1);
    expect(filterTimeBookings(bookings, { deliveryNo: 20 })).toHaveLength(1);
    expect(filterTimeBookings(bookings, { from: "2026-03-02", to: "2026-03-02" })).toHaveLength(1);
    expect(filterTimeBookings(bookings, { from: "2026-03-02", to: "2026-03-10" })).toHaveLength(2);
  });
});
