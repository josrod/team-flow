import { read as readXlsx, utils as xlsxUtils } from "xlsx";
import { format, isValid, parseISO, differenceInCalendarDays } from "date-fns";
import type { AbsenceType, TeamMember } from "@/types";

export interface InventAbsentRow {
  workDate: string; // ISO "yyyy-MM-dd"
  userLoginName: string;
  duration: number; // hours
  activityKind: string;
}

export interface ParsedAbsence {
  memberId: string;
  memberName: string;
  loginName: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
}

export interface UnmatchedRow {
  loginName: string;
  reason: string;
}

export interface ParseResult {
  absences: ParsedAbsence[];
  unmatched: UnmatchedRow[];
  skipped: number;
}

const EXCLUDED_KINDS = new Set(["public holiday", "training", "working hours"]);

const ACTIVITY_TO_TYPE: Record<string, AbsenceType> = {
  vacation: "vacation",
  "sick leave": "sick-leave",
  absent: "sick-leave",
  "business trip": "work-travel",
};

function mapActivityKind(kind: string): AbsenceType | null {
  return ACTIVITY_TO_TYPE[kind.toLowerCase().trim()] ?? null;
}

function oaDateToIso(oa: number): string | null {
  // Excel OADate epoch — 25569 days between 1899-12-30 and 1970-01-01
  const ms = Math.round((oa - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isValid(d) ? format(d, "yyyy-MM-dd") : null;
}

function parseCellDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return oaDateToIso(raw);
  if (raw instanceof Date) return isValid(raw) ? format(raw, "yyyy-MM-dd") : null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  const num = Number(s);
  if (!Number.isNaN(num) && num > 10000) return oaDateToIso(num);
  // dd/MM/yyyy or dd.MM.yyyy
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isValid(d) ? format(d, "yyyy-MM-dd") : null;
  }
  return null;
}

interface ReducedRow {
  workDate: string;
  duration: number;
  activityKind: string;
}

function findMember(
  loginName: string,
  members: TeamMember[]
): TeamMember | undefined {
  const lower = loginName.toLowerCase();
  const byLogin = members.find(
    (m) => m.loginName && m.loginName.toLowerCase() === lower
  );
  if (byLogin) return byLogin;
  // Fallback by full name match
  return members.find((m) => m.name.toLowerCase() === lower);
}

export async function parseInventAbsentFile(
  file: File,
  members: TeamMember[]
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = readXlsx(new Uint8Array(buffer), { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // header: 1 returns array-of-arrays. range: 1 skips the header row (row index 0)
  const rows = xlsxUtils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: 1,
    defval: "",
    blankrows: false,
  });

  const parsed: InventAbsentRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!Array.isArray(r) || r.length === 0) continue;
    const workDate = parseCellDate(r[0]);
    const userLoginName = String(r[1] ?? "").trim();
    const durationRaw = r[2];
    const duration =
      typeof durationRaw === "number"
        ? durationRaw
        : Number(String(durationRaw ?? "").replace(",", "."));
    const activityKind = String(r[3] ?? "").trim();

    if (!workDate || !userLoginName || Number.isNaN(duration)) {
      skipped++;
      continue;
    }
    const kindLower = activityKind.toLowerCase();
    if (EXCLUDED_KINDS.has(kindLower) || duration === 0) {
      skipped++;
      continue;
    }
    parsed.push({ workDate, userLoginName, duration, activityKind });
  }

  // Group by user + day (sum duration, keep first non-excluded activityKind)
  const perUserDay = new Map<string, ReducedRow>();
  for (const row of parsed) {
    const key = `${row.userLoginName.toLowerCase()}|${row.workDate}`;
    const existing = perUserDay.get(key);
    if (existing) {
      existing.duration += row.duration;
    } else {
      perUserDay.set(key, {
        workDate: row.workDate,
        duration: row.duration,
        activityKind: row.activityKind,
      });
    }
  }

  // Group by user → consecutive day ranges of same type
  const perUser = new Map<string, ReducedRow[]>();
  for (const [key, value] of perUserDay) {
    const login = key.split("|")[0];
    const arr = perUser.get(login) ?? [];
    arr.push(value);
    perUser.set(login, arr);
  }

  const absences: ParsedAbsence[] = [];
  const unmatched: UnmatchedRow[] = [];
  const unmatchedSeen = new Set<string>();

  for (const [loginLower, items] of perUser) {
    items.sort((a, b) => a.workDate.localeCompare(b.workDate));

    // Find the original-casing login from the first occurrence
    const originalLogin =
      parsed.find((p) => p.userLoginName.toLowerCase() === loginLower)
        ?.userLoginName ?? loginLower;

    const member = findMember(originalLogin, members);
    if (!member) {
      if (!unmatchedSeen.has(loginLower)) {
        unmatchedSeen.add(loginLower);
        unmatched.push({
          loginName: originalLogin,
          reason: "Member not found by loginName or name",
        });
      }
      continue;
    }

    let groupStart = items[0];
    let groupEnd = items[0];
    let groupType = mapActivityKind(items[0].activityKind);

    const flushGroup = (start: ReducedRow, end: ReducedRow, type: AbsenceType | null) => {
      if (!type) return;
      absences.push({
        memberId: member.id,
        memberName: member.name,
        loginName: originalLogin,
        type,
        startDate: start.workDate,
        endDate: end.workDate,
      });
    };

    for (let i = 1; i < items.length; i++) {
      const current = items[i];
      const currentType = mapActivityKind(current.activityKind);
      const prevDate = parseISO(groupEnd.workDate);
      const isConsecutive =
        differenceInCalendarDays(parseISO(current.workDate), prevDate) === 1;
      if (isConsecutive && currentType === groupType) {
        groupEnd = current;
      } else {
        flushGroup(groupStart, groupEnd, groupType);
        groupStart = current;
        groupEnd = current;
        groupType = currentType;
      }
    }
    flushGroup(groupStart, groupEnd, groupType);
  }

  return { absences, unmatched, skipped };
}



