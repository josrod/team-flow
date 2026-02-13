import { describe, it, expect } from "vitest";
import { importDataSchema } from "@/lib/validation";

describe("importDataSchema", () => {
  it("rejects empty object", () => {
    const result = importDataSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects teams with missing required fields", () => {
    const result = importDataSchema.safeParse({
      teams: [{ name: "Test" }], // missing id
    });
    expect(result.success).toBe(false);
  });

  it("rejects members with wrong types", () => {
    const result = importDataSchema.safeParse({
      members: [{ id: 123, name: true, role: null, teamId: "t1" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects absences with invalid type enum", () => {
    const result = importDataSchema.safeParse({
      absences: [{ id: "a1", memberId: "m1", type: "holiday", startDate: "2025-01-01", endDate: "2025-01-05" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects random string", () => {
    const result = importDataSchema.safeParse("not an object");
    expect(result.success).toBe(false);
  });

  it("accepts valid data", () => {
    const result = importDataSchema.safeParse({
      teams: [{ id: "t1", name: "Team A" }],
      members: [{ id: "m1", name: "Alice", role: "Dev", teamId: "t1" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial valid data (only absences)", () => {
    const result = importDataSchema.safeParse({
      absences: [{ id: "a1", memberId: "m1", type: "vacation", startDate: "2025-01-01", endDate: "2025-01-05" }],
    });
    expect(result.success).toBe(true);
  });
});
