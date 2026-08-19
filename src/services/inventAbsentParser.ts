import { read as readXlsx, utils as xlsxUtils } from "xlsx";
import { parseISO, differenceInCalendarDays } from "date-fns";
import { asIsoDate, asNumber, asText } from "@/lib/inventValues";
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
  /** Total booked hours across the range. */
  hours: number;
  /** Distinct INVENT activity kinds behind the range. */
  activities: string[];
}

export interface AbsenceRange {
  type: AbsenceType;
  startDate: string;
  endDate: string;
  hours: number;
  activities: string[];
}

export interface UnmatchedRow {
  loginName: string;
  reason: string;
  ranges: AbsenceRange[];
}

export interface ParseResult {
  absences: ParsedAbsence[];
  unmatched: UnmatchedRow[];
  skipped: number;
  /** Data rows read from the sheet, including skipped ones. */
  rowsProcessed: number;
  /** Per-row warnings encoded as `{excelRow}|{code}` for translation in the UI. */
  warnings: string[];
}


/** Activity kinds that are not absences at all. */
const EXCLUDED_KINDS = ["public holiday", "training", "working hours", "home office"];

const ACTIVITY_TO_TYPE: Record<string, AbsenceType> = {
  vacation: "vacation",
  "sick leave": "sick-leave",
  absent: "sick-leave",
  "business trip": "work-travel",
  "business trip (short)": "work-travel",
};

function mapActivityKind(kind: string): AbsenceType | null {
  return ACTIVITY_TO_TYPE[kind.toLowerCase().trim()] ?? null;
}

const isExcludedKind = (kind: string) => {
  const lower = kind.toLowerCase();
  return EXCLUDED_KINDS.some((excluded) => lower.includes(excluded));
};

interface ReducedRow {
  workDate: string;
  duration: number;
  activityKind: string;
  activities: string[];
}

function findMember(loginName: string, members: TeamMember[]): TeamMember | undefined {
  const lower = loginName.toLowerCase();
  const byLogin = members.find((m) => m.loginName && m.loginName.toLowerCase() === lower);
  if (byLogin) return byLogin;
  // Fallback by full name match
  return members.find((m) => m.name.toLowerCase() === lower);
}

export interface InventValidationResult {
  ok: boolean;
  errors: string[];
}

const EXPECTED_HEADERS: { col: number; name: string }[] = [
  { col: 0, name: "Work date" },
  { col: 2, name: "Person" },
  { col: 3, name: "Duration" },
  { col: 4, name: "Activity kind" },
];

export async function validateInventAbsentFile(file: File): Promise<InventValidationResult> {
  const errors: string[] = [];

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    errors.push(`Extensión no soportada: se esperaba .xlsx (recibido "${file.name}")`);
    return { ok: false, errors };
  }

  let wb;
  try {
    const buffer = await file.arrayBuffer();
    wb = readXlsx(new Uint8Array(buffer), { type: "array", cellDates: false });
  } catch {
    return { ok: false, errors: ["No se pudo leer el archivo XLSX (posiblemente corrupto)."] };
  }

  if (!wb.SheetNames.length) {
    return { ok: false, errors: ["El archivo no contiene ninguna hoja."] };
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const headerRow = xlsxUtils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: 0,
    defval: "",
    blankrows: false,
  })[0];

  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    return { ok: false, errors: ["La primera fila (encabezados) está vacía."] };
  }

  for (const { col, name } of EXPECTED_HEADERS) {
    const cell = asText(headerRow[col]).toLowerCase();
    if (cell !== name.toLowerCase()) {
      const colLetter = String.fromCharCode(65 + col);
      errors.push(
        `Encabezado de columna ${colLetter} debe ser "${name}" (encontrado: "${headerRow[col] ?? ""}")`
      );
    }
  }

  // Sample first 20 data rows to confirm there's at least one parseable date
  const dataRows = xlsxUtils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    range: 1,
    defval: "",
    blankrows: false,
  });

  const sample = dataRows.slice(0, 50);
  const hasAnyDate = sample.some((r) => Array.isArray(r) && asIsoDate(r[1]) !== null);
  const hasAnyPerson = sample.some((r) => Array.isArray(r) && asText(r[2]).length > 0);

  if (sample.length === 0) {
    errors.push("El archivo no contiene filas de datos después de los encabezados.");
  } else {
    if (!hasAnyDate) {
      errors.push(
        'Ninguna celda de la columna B (Work date) tiene un formato de fecha válido (esperado fecha Excel o YYYY-MM-DD / DD/MM/YYYY).'
      );
    }
    if (!hasAnyPerson) {
      errors.push("Ninguna celda de la columna C (Person) contiene un login.");
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Pure parser over the sheet matrix (row 0 is the header). Columns follow the
 * INVENT Absences export by position: B work date, C person, D duration,
 * E activity kind.
 */
export function parseInventAbsentMatrix(matrix: unknown[][], members: TeamMember[]): ParseResult {
  const parsed: InventAbsentRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let rowsProcessed = 0;

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const excelRow = i + 1;
    if (!Array.isArray(r) || r.length === 0) continue;

    const workDate = asIsoDate(r[1]);
    const userLoginName = asText(r[2]);
    const activityKind = asText(r[4]);
    const duration = asNumber(r[3]);

    // Fully empty row: skip silently.
    if (!workDate && !userLoginName && !activityKind) continue;

    rowsProcessed++;


    if (!workDate || !userLoginName || !activityKind) {
      warnings.push(`${excelRow}|absenceMissingCore`);
      skipped++;
      continue;
    }

    if (isExcludedKind(activityKind) || duration === 0) {
      skipped++;
      continue;
    }
    parsed.push({ workDate, userLoginName, duration, activityKind });
  }

  // Group by user + day (sum duration, accumulate distinct activity kinds)
  const perUserDay = new Map<string, ReducedRow>();
  for (const row of parsed) {
    const key = `${row.userLoginName.toLowerCase()}|${row.workDate}`;
    const existing = perUserDay.get(key);
    if (existing) {
      existing.duration += row.duration;
      if (!existing.activities.includes(row.activityKind)) existing.activities.push(row.activityKind);
    } else {
      perUserDay.set(key, {
        workDate: row.workDate,
        duration: row.duration,
        activityKind: row.activityKind,
        activities: [row.activityKind],
      });
    }
  }

  const perUser = new Map<string, ReducedRow[]>();
  for (const [key, value] of perUserDay) {
    const login = key.split("|")[0];
    const arr = perUser.get(login) ?? [];
    arr.push(value);
    perUser.set(login, arr);
  }

  const absences: ParsedAbsence[] = [];
  const unmatched: UnmatchedRow[] = [];

  function computeRanges(items: ReducedRow[]): AbsenceRange[] {
    const ranges: AbsenceRange[] = [];
    let groupStart = items[0];
    let groupEnd = items[0];
    let groupType = mapActivityKind(items[0].activityKind);
    let groupHours = items[0].duration;
    let groupActivities = [...items[0].activities];

    const flush = (start: ReducedRow, end: ReducedRow, type: AbsenceType | null) => {
      if (!type) return;
      ranges.push({
        type,
        startDate: start.workDate,
        endDate: end.workDate,
        hours: Math.round(groupHours * 100) / 100,
        activities: [...groupActivities],
      });
    };

    for (let i = 1; i < items.length; i++) {
      const current = items[i];
      const currentType = mapActivityKind(current.activityKind);
      const isConsecutive =
        differenceInCalendarDays(parseISO(current.workDate), parseISO(groupEnd.workDate)) === 1;
      if (isConsecutive && currentType === groupType) {
        groupEnd = current;
        groupHours += current.duration;
        for (const activity of current.activities) {
          if (!groupActivities.includes(activity)) groupActivities.push(activity);
        }
      } else {
        flush(groupStart, groupEnd, groupType);
        groupStart = current;
        groupEnd = current;
        groupType = currentType;
        groupHours = current.duration;
        groupActivities = [...current.activities];
      }
    }
    flush(groupStart, groupEnd, groupType);
    return ranges;
  }

  for (const [loginLower, items] of perUser) {
    items.sort((a, b) => a.workDate.localeCompare(b.workDate));

    const originalLogin =
      parsed.find((p) => p.userLoginName.toLowerCase() === loginLower)?.userLoginName ?? loginLower;

    const ranges = computeRanges(items);
    const member = findMember(originalLogin, members);

    if (!member) {
      unmatched.push({
        loginName: originalLogin,
        reason: "Member not found by loginName or name",
        ranges,
      });
      continue;
    }

    for (const r of ranges) {
      absences.push({
        memberId: member.id,
        memberName: member.name,
        loginName: originalLogin,
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        hours: r.hours,
        activities: r.activities,
      });
    }
  }

  return { absences, unmatched, skipped, rowsProcessed, warnings };
}

export async function parseInventAbsentFile(
  file: File,
  members: TeamMember[]
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = readXlsx(new Uint8Array(buffer), { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = xlsxUtils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  return parseInventAbsentMatrix(matrix, members);
}
