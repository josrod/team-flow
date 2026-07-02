import { describe, expect, it } from "vitest";
import { getEpicQuarterSpan } from "@/lib/epicSpan";
import { NO_DATE_BUCKET } from "@/lib/quarters";

describe("getEpicQuarterSpan", () => {
  const visible = ["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"];

  it("returns NO_DATE_BUCKET when both dates are missing", () => {
    expect(getEpicQuarterSpan({}, visible)).toEqual([NO_DATE_BUCKET]);
  });

  it("uses target date when start is missing", () => {
    expect(getEpicQuarterSpan({ targetDate: "2026-05-15" }, visible)).toEqual(["2026-Q2"]);
  });

  it("uses start date when target is missing", () => {
    expect(getEpicQuarterSpan({ startDate: "2026-02-01" }, visible)).toEqual(["2026-Q1"]);
  });

  it("spans multiple quarters when the range crosses them", () => {
    expect(
      getEpicQuarterSpan(
        { startDate: "2026-02-10", targetDate: "2026-08-20" },
        visible,
      ),
    ).toEqual(["2026-Q1", "2026-Q2", "2026-Q3"]);
  });

  it("handles inverted dates (target before start)", () => {
    expect(
      getEpicQuarterSpan(
        { startDate: "2026-08-01", targetDate: "2026-02-01" },
        visible,
      ),
    ).toEqual(["2026-Q1", "2026-Q2", "2026-Q3"]);
  });

  it("returns NO_DATE_BUCKET for invalid dates", () => {
    expect(getEpicQuarterSpan({ targetDate: "not-a-date" }, visible)).toEqual([NO_DATE_BUCKET]);
  });
});
