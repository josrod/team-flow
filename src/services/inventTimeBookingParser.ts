import { read as readXlsx, utils as xlsxUtils } from "xlsx";
import { asIsoDate, asNumber, asOptionalInt, asText } from "@/lib/inventValues";

/** One normalized effort booking coming from an INVENT Time Booking export. */
export interface ParsedTimeBooking {
  id: string;
  workDate: string | null;
  person: string;
  bookingNo: number;
  duration: number;
  organization: string;
  projectCode: string;
  taskName: string;
  activityKind: string;
  activityGroup: string;
  activityType: string;
  remarks?: string;
  deliveryNo?: number;
  deliveryPosition?: number;
}

export interface TimeBookingParseResult {
  items: ParsedTimeBooking[];
  persons: number;
  projects: number;
  /** Row-level warnings, each prefixed with the Excel row number. */
  warnings: string[];
  sourceFileName: string;
}

/**
 * Column positions are fixed by the INVENT export: headers are localised but
 * the order never changes, so every field is read by index.
 */
const COL = {
  workDate: 0,
  person: 1,
  bookingNo: 2,
  duration: 3,
  organization: 4,
  projectCode: 5,
  taskName: 6,
  activityKind: 9,
  activityGroup: 10,
  activityType: 11,
  remarks: 12,
  deliveryNo: 17,
  deliveryPosition: 18,
} as const;

const sheetMatrix = (buffer: ArrayBuffer): unknown[][] => {
  const wb = readXlsx(new Uint8Array(buffer), { type: "array", cellDates: true });
  if (!wb.SheetNames.length) return [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return xlsxUtils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
};

/**
 * Pure parser over the sheet matrix (row 0 is the header and is skipped), so it
 * can be unit-tested and reused outside the browser.
 */
export function parseTimeBookingMatrix(
  matrix: unknown[][],
  sourceFileName: string
): TimeBookingParseResult {
  const items: ParsedTimeBooking[] = [];
  const warnings: string[] = [];
  const persons = new Set<string>();
  const projects = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const excelRow = i + 1;
    if (!Array.isArray(row) || row.length === 0) continue;

    const workDate = asIsoDate(row[COL.workDate]);
    const person = asText(row[COL.person]);
    const projectCode = asText(row[COL.projectCode]);
    const taskName = asText(row[COL.taskName]);

    // Fully empty row: skip silently.
    if (!workDate && !person && !projectCode && !taskName) continue;

    if (!person || !projectCode || !taskName) {
      warnings.push(`${excelRow}|missingCore`);
      continue;
    }

    const bookingNo = asNumber(row[COL.bookingNo]);
    const deliveryNo = asOptionalInt(row[COL.deliveryNo]);
    const deliveryPosition = asOptionalInt(row[COL.deliveryPosition]);
    const remarks = asText(row[COL.remarks]);

    items.push({
      id: `${deliveryNo ?? "no-delivery"}-${bookingNo}-${i}`,
      workDate,
      person,
      bookingNo,
      duration: asNumber(row[COL.duration]),
      organization: asText(row[COL.organization]),
      projectCode,
      taskName,
      activityKind: asText(row[COL.activityKind]),
      activityGroup: asText(row[COL.activityGroup]),
      activityType: asText(row[COL.activityType]),
      remarks: remarks || undefined,
      deliveryNo,
      deliveryPosition,
    });

    persons.add(person.toLowerCase());
    projects.add(projectCode.toLowerCase());
  }

  return {
    items,
    persons: persons.size,
    projects: projects.size,
    warnings,
    sourceFileName,
  };
}

export async function parseTimeBookingFile(file: File): Promise<TimeBookingParseResult> {
  const matrix = sheetMatrix(await file.arrayBuffer());
  return parseTimeBookingMatrix(matrix, file.name);
}

export interface TimeBookingValidation {
  ok: boolean;
  /** Translation keys for the import dialog. */
  errors: string[];
}

/** Cheap structural check before the full parse. */
export async function validateTimeBookingFile(file: File): Promise<TimeBookingValidation> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, errors: ["timeBookingErrExtension"] };
  }
  let matrix: unknown[][];
  try {
    matrix = sheetMatrix(await file.arrayBuffer());
  } catch {
    return { ok: false, errors: ["timeBookingErrUnreadable"] };
  }
  if (matrix.length < 2) return { ok: false, errors: ["timeBookingErrNoRows"] };

  const sample = matrix.slice(1, 51).filter((r) => Array.isArray(r));
  const hasDate = sample.some((r) => asIsoDate(r[COL.workDate]) !== null);
  const hasPerson = sample.some((r) => asText(r[COL.person]).length > 0);
  const hasProject = sample.some((r) => asText(r[COL.projectCode]).length > 0);

  const errors: string[] = [];
  if (!hasDate) errors.push("timeBookingErrNoDates");
  if (!hasPerson) errors.push("timeBookingErrNoPersons");
  if (!hasProject) errors.push("timeBookingErrNoProjects");
  return { ok: errors.length === 0, errors };
}
