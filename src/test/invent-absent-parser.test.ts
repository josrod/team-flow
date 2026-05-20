import { describe, it, expect } from "vitest";
import { utils as xlsxUtils, write as writeXlsx } from "xlsx";
import { parseInventAbsentFile } from "@/services/inventAbsentParser";
import type { TeamMember } from "@/types";

function buildXlsxFile(): File {
  const rows: unknown[][] = [
    [
      "Work date",
      null,
      "Person",
      "Duration",
      "Activity kind",
      "Default organization",
      "Delivery no",
      "Delivery position",
      "Default plant",
      "Default company code",
      "Default company code name",
      "Support",
    ],
    // Group header row (only first column populated) – should be skipped
    ["ABlinov ", null, null, null, null, null, null, null, null, null, null, null],
    // Excluded: Public Holiday
    [null, new Date(2026, 3, 3), "ABlinov", 7.6, "Public Holiday", "", "", "", "", "", "", ""],
    // Two consecutive Absent rows -> should collapse into one sick-leave range
    [null, new Date(2026, 4, 11), "ABlinov", 7.6, "Absent", "", "", "", "", "", "", ""],
    [null, new Date(2026, 4, 12), "ABlinov", 3.8, "Absent", "", "", "", "", "", "", ""],
    // Business Trip (short) -> work-travel
    [null, new Date(2026, 5, 1), "ABlinov", 7.6, "Business Trip (short)", "", "", "", "", "", "", ""],
  ];
  const ws = xlsxUtils.aoa_to_sheet(rows);
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, "Sheet");
  const buf = writeXlsx(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "Absent_test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const members: TeamMember[] = [
  { id: "m1", name: "Alexander Blinov", role: "Engineer", teamId: "t1", loginName: "ABlinov" },
];

describe("parseInventAbsentFile (new ROSEN absence export format)", () => {
  it("parses real-format file: skips Public Holiday, collapses consecutive Absent, maps Business Trip (short)", async () => {
    const file = buildXlsxFile();
    const result = await parseInventAbsentFile(file, members);

    expect(result.unmatched).toEqual([]);
    expect(result.absences).toHaveLength(2);

    const sick = result.absences.find((a) => a.type === "sick-leave");
    expect(sick).toBeDefined();
    expect(sick?.startDate).toBe("2026-05-11");
    expect(sick?.endDate).toBe("2026-05-12");
    expect(sick?.memberId).toBe("m1");

    const travel = result.absences.find((a) => a.type === "work-travel");
    expect(travel).toBeDefined();
    expect(travel?.startDate).toBe("2026-06-01");
    expect(travel?.endDate).toBe("2026-06-01");
  });

  it("reports unmatched logins", async () => {
    const file = buildXlsxFile();
    const result = await parseInventAbsentFile(file, []);
    expect(result.absences).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].loginName).toBe("ABlinov");
  });
});
