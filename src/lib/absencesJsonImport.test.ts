import { describe, expect, it } from "vitest";
import {
  buildAbsenceKey,
  buildJsonImportPreview,
  type ExistingAbsence,
  type ExistingMember,
  type JsonImportAbsence,
  type JsonImportMemberRef,
} from "./absencesJsonImport";

const members: ExistingMember[] = [
  { id: "m-1", name: "Ada Lovelace" },
  { id: "m-2", name: "Alan Turing" },
  { id: "m-3", name: "Grace Hopper" },
];

const mkAbsence = (
  over: Partial<JsonImportAbsence> = {},
): JsonImportAbsence => ({
  memberId: "m-1",
  type: "vacation",
  startDate: "2026-01-10",
  endDate: "2026-01-15",
  ...over,
});

describe("buildAbsenceKey", () => {
  it("joins the tuple with a pipe separator", () => {
    expect(
      buildAbsenceKey({
        memberId: "m-1",
        type: "vacation",
        startDate: "2026-01-10",
        endDate: "2026-01-15",
      }),
    ).toBe("m-1|vacation|2026-01-10|2026-01-15");
  });
});

describe("buildJsonImportPreview — memberId resolution", () => {
  it("resolves directly by memberId when the id exists in the catalog", () => {
    const rows = buildJsonImportPreview([mkAbsence()], [], members, []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: "m-1",
      memberName: "Ada Lovelace",
      status: "ok",
    });
  });

  it("keeps the current member's canonical name (not the JSON's)", () => {
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "m-1", name: "Ada L. (old export)" },
    ];
    const rows = buildJsonImportPreview(
      [mkAbsence()],
      jsonMembers,
      members,
      [],
    );

    expect(rows[0].memberName).toBe("Ada Lovelace");
  });
});

describe("buildJsonImportPreview — fallback by name", () => {
  it("falls back to name lookup via the JSON members[] reference", () => {
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "legacy-42", name: "Alan Turing" },
    ];
    const absences = [mkAbsence({ memberId: "legacy-42" })];

    const rows = buildJsonImportPreview(absences, jsonMembers, members, []);

    expect(rows[0]).toMatchObject({
      memberId: "m-2",
      memberName: "Alan Turing",
      status: "ok",
    });
  });

  it("matches names case-insensitively and trims whitespace", () => {
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "legacy-99", name: "  grace HOPPER  " },
    ];
    const rows = buildJsonImportPreview(
      [mkAbsence({ memberId: "legacy-99" })],
      jsonMembers,
      members,
      [],
    );

    expect(rows[0]).toMatchObject({ memberId: "m-3", status: "ok" });
  });

  it("marks the row as missing when neither id nor name match", () => {
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "legacy-1", name: "Someone Else" },
    ];
    const rows = buildJsonImportPreview(
      [mkAbsence({ memberId: "legacy-1" })],
      jsonMembers,
      members,
      [],
    );

    expect(rows[0]).toMatchObject({
      memberId: null,
      memberName: "Someone Else",
      status: "missing",
    });
  });

  it("uses the raw memberId as label when no JSON reference exists either", () => {
    const rows = buildJsonImportPreview(
      [mkAbsence({ memberId: "unknown-id" })],
      [],
      members,
      [],
    );

    expect(rows[0]).toMatchObject({
      memberId: null,
      memberName: "unknown-id",
      status: "missing",
    });
  });
});

describe("buildJsonImportPreview — duplicate detection", () => {
  const existing: ExistingAbsence[] = [
    {
      memberId: "m-1",
      type: "vacation",
      startDate: "2026-01-10",
      endDate: "2026-01-15",
    },
  ];

  it("flags a duplicate when the full tuple matches", () => {
    const rows = buildJsonImportPreview([mkAbsence()], [], members, existing);
    expect(rows[0].status).toBe("duplicate");
  });

  it("does NOT flag as duplicate when the type differs", () => {
    const rows = buildJsonImportPreview(
      [mkAbsence({ type: "sickness" })],
      [],
      members,
      existing,
    );
    expect(rows[0].status).toBe("ok");
  });

  it("does NOT flag as duplicate when a date differs", () => {
    const rows = buildJsonImportPreview(
      [mkAbsence({ endDate: "2026-01-16" })],
      [],
      members,
      existing,
    );
    expect(rows[0].status).toBe("ok");
  });

  it("does NOT flag as duplicate when the resolved member differs", () => {
    const rows = buildJsonImportPreview(
      [mkAbsence({ memberId: "m-2" })],
      [],
      members,
      existing,
    );
    expect(rows[0].status).toBe("ok");
  });

  it("uses the RESOLVED memberId (post name-fallback) for the duplicate key", () => {
    // Legacy id resolves to m-1 via name → should collide with the existing m-1 absence.
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "legacy-1", name: "Ada Lovelace" },
    ];
    const rows = buildJsonImportPreview(
      [mkAbsence({ memberId: "legacy-1" })],
      jsonMembers,
      members,
      existing,
    );

    expect(rows[0]).toMatchObject({ memberId: "m-1", status: "duplicate" });
  });
});

describe("buildJsonImportPreview — batch behaviour", () => {
  it("classifies each row independently", () => {
    const jsonMembers: JsonImportMemberRef[] = [
      { id: "legacy-3", name: "Grace Hopper" },
    ];
    const existing: ExistingAbsence[] = [
      {
        memberId: "m-1",
        type: "vacation",
        startDate: "2026-01-10",
        endDate: "2026-01-15",
      },
    ];

    const rows = buildJsonImportPreview(
      [
        mkAbsence(), // duplicate of existing (m-1)
        mkAbsence({ memberId: "m-2", startDate: "2026-02-01", endDate: "2026-02-05" }), // ok direct
        mkAbsence({ memberId: "legacy-3", startDate: "2026-03-01", endDate: "2026-03-02" }), // ok via name fallback → m-3
        mkAbsence({ memberId: "ghost", startDate: "2026-04-01", endDate: "2026-04-02" }), // missing
      ],
      jsonMembers,
      members,
      existing,
    );

    expect(rows.map((r) => r.status)).toEqual([
      "duplicate",
      "ok",
      "ok",
      "missing",
    ]);
    expect(rows.map((r) => r.memberId)).toEqual(["m-1", "m-2", "m-3", null]);
  });
});
