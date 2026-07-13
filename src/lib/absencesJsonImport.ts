// Pure helpers to preview an "absences import" from the global JSON backup.
// Kept framework-free so it can be unit-tested without React.

import type { AbsenceType } from "@/context/AppContext";

export type JsonImportMemberRef = { id: string; name: string };

export type JsonImportAbsence = {
  memberId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
};

export type ExistingMember = { id: string; name: string };

export type ExistingAbsence = {
  memberId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
};

export type JsonImportRowStatus = "ok" | "duplicate" | "missing";

export type JsonImportRow = {
  memberId: string | null;
  memberName: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  status: JsonImportRowStatus;
};

export const buildAbsenceKey = (a: {
  memberId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
}): string => `${a.memberId}|${a.type}|${a.startDate}|${a.endDate}`;

/**
 * Resolve JSON-backup absences against the current members/absences catalog.
 *
 * Resolution order for each absence:
 *  1. Direct match by `memberId` against the current members.
 *  2. Fallback: look up the id in the JSON's `members[]` reference, then match
 *     the current members by (case-insensitive) name.
 *  3. Otherwise → status `"missing"`.
 *
 * A resolved absence is `"duplicate"` when an existing absence shares the same
 * `memberId + type + startDate + endDate` tuple; otherwise `"ok"`.
 */
export const buildJsonImportPreview = (
  jsonAbsences: readonly JsonImportAbsence[],
  jsonMembers: readonly JsonImportMemberRef[],
  currentMembers: readonly ExistingMember[],
  currentAbsences: readonly ExistingAbsence[],
): JsonImportRow[] => {
  const membersById = new Map(currentMembers.map((m) => [m.id, m]));
  const membersByName = new Map(
    currentMembers.map((m) => [m.name.trim().toLowerCase(), m]),
  );
  const jsonMembersById = new Map(jsonMembers.map((m) => [m.id, m]));
  const existingKeys = new Set(currentAbsences.map(buildAbsenceKey));

  return jsonAbsences.map((a) => {
    let member = membersById.get(a.memberId);
    let memberName = member?.name ?? "";

    if (!member) {
      const src = jsonMembersById.get(a.memberId);
      if (src) {
        memberName = src.name;
        member = membersByName.get(src.name.trim().toLowerCase());
      }
    }

    if (!member) {
      return {
        memberId: null,
        memberName: memberName || a.memberId,
        type: a.type,
        startDate: a.startDate,
        endDate: a.endDate,
        status: "missing" as const,
      };
    }

    const key = buildAbsenceKey({
      memberId: member.id,
      type: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
    });

    return {
      memberId: member.id,
      memberName: member.name,
      type: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      status: existingKeys.has(key) ? ("duplicate" as const) : ("ok" as const),
    };
  });
};
