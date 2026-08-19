import { supabase } from "@/integrations/supabase/client";
import type { TeamMember } from "@/types";
import type { ParsedTimeBooking } from "@/services/inventTimeBookingParser";
import { recordImport } from "@/services/importHistoryService";


export interface TimeBooking {
  id: string;
  workDate: string | null;
  person: string;
  memberId: string | null;
  bookingNo: number;
  duration: number;
  organization: string;
  projectCode: string;
  taskName: string;
  activityKind: string;
  activityGroup: string;
  activityType: string;
  remarks: string | null;
  deliveryNo: number | null;
  deliveryPosition: number | null;
}

interface TimeBookingRow {
  id: string;
  work_date: string | null;
  person: string;
  member_id: string | null;
  booking_no: number;
  duration: number | string;
  organization: string;
  project_code: string;
  task_name: string;
  activity_kind: string;
  activity_group: string;
  activity_type: string;
  remarks: string | null;
  delivery_no: number | null;
  delivery_position: number | null;
}

const mapRow = (row: TimeBookingRow): TimeBooking => ({
  id: row.id,
  workDate: row.work_date,
  person: row.person,
  memberId: row.member_id,
  bookingNo: Number(row.booking_no),
  duration: Number(row.duration),
  organization: row.organization,
  projectCode: row.project_code,
  taskName: row.task_name,
  activityKind: row.activity_kind,
  activityGroup: row.activity_group,
  activityType: row.activity_type,
  remarks: row.remarks,
  deliveryNo: row.delivery_no,
  deliveryPosition: row.delivery_position,
});

/** Resolves an INVENT person string to a team member (login name, then full name). */
export const matchMemberId = (person: string, members: TeamMember[]): string | null => {
  const lower = person.toLowerCase().trim();
  if (!lower) return null;
  const byLogin = members.find((m) => m.loginName && m.loginName.toLowerCase() === lower);
  if (byLogin) return byLogin.id;
  const byName = members.find((m) => m.name.toLowerCase() === lower);
  return byName?.id ?? null;
};

export interface TimeBookingFilters {
  person?: string;
  project?: string;
  task?: string;
  activityKind?: string;
  deliveryNo?: number | null;
  from?: string;
  to?: string;
}

const contains = (value: string, term?: string) =>
  !term || value.toLowerCase().includes(term.toLowerCase().trim());

/** Client-side filtering: partial case-insensitive text, exact delivery, inclusive dates. */
export const filterTimeBookings = (
  bookings: TimeBooking[],
  filters: TimeBookingFilters
): TimeBooking[] =>
  bookings.filter((b) => {
    if (!contains(b.person, filters.person)) return false;
    if (!contains(b.projectCode, filters.project)) return false;
    if (!contains(b.taskName, filters.task)) return false;
    if (!contains(b.activityKind, filters.activityKind)) return false;
    if (filters.deliveryNo != null && b.deliveryNo !== filters.deliveryNo) return false;
    if (filters.from && (!b.workDate || b.workDate < filters.from)) return false;
    if (filters.to && (!b.workDate || b.workDate > filters.to)) return false;
    return true;
  });

export interface TimeBookingTotals {
  hours: number;
  bookings: number;
  persons: number;
  projects: number;
}

export const summarizeTimeBookings = (bookings: TimeBooking[]): TimeBookingTotals => ({
  hours: bookings.reduce((sum, b) => sum + b.duration, 0),
  bookings: bookings.length,
  persons: new Set(bookings.map((b) => b.person.toLowerCase())).size,
  projects: new Set(bookings.map((b) => b.projectCode.toLowerCase())).size,
});

export interface GroupedHours {
  key: string;
  label: string;
  hours: number;
}

const groupBy = (
  bookings: TimeBooking[],
  pick: (booking: TimeBooking) => string
): GroupedHours[] => {
  const map = new Map<string, GroupedHours>();
  for (const booking of bookings) {
    const label = pick(booking) || "—";
    const key = label.toLowerCase();
    const entry = map.get(key);
    if (entry) entry.hours += booking.duration;
    else map.set(key, { key, label, hours: booking.duration });
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
};

export const hoursByPerson = (bookings: TimeBooking[]) => groupBy(bookings, (b) => b.person);
export const hoursByProject = (bookings: TimeBooking[]) => groupBy(bookings, (b) => b.projectCode);
export const hoursByActivity = (bookings: TimeBooking[]) => groupBy(bookings, (b) => b.activityKind);

/** ISO week key (`YYYY-Www`) for an ISO date string. */
export const isoWeekKey = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

/** Monday–Sunday ISO date range for an ISO week key (`YYYY-Www`). */
export const isoWeekRange = (weekKey: string): { from: string; to: string } => {
  const [yearPart, weekPart] = weekKey.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
};

/** Hours per ISO week, ascending, for the trend chart. */
export const hoursByWeek = (bookings: TimeBooking[]): GroupedHours[] => {
  const map = new Map<string, GroupedHours>();
  for (const booking of bookings) {
    if (!booking.workDate) continue;
    const key = isoWeekKey(booking.workDate);
    const entry = map.get(key);
    if (entry) entry.hours += booking.duration;
    else map.set(key, { key, label: key, hours: booking.duration });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
};


export const fetchTimeBookings = async (): Promise<TimeBooking[]> => {
  const { data, error } = await supabase
    .from("time_bookings")
    .select("*")
    .order("work_date", { ascending: false })
    .limit(20000);
  if (error) throw error;
  return (data as TimeBookingRow[]).map(mapRow);
};

export interface TimeBookingImportSummary {
  imported: number;
  replaced: number;
  persons: number;
  projects: number;
}

const CHUNK = 500;

export interface TimeBookingImportMeta {
  persons: number;
  projects: number;
  /** Per-row issues encoded as `{excelRow}|{code}`. */
  warnings: string[];
  /** Data rows read from the sheet, including skipped ones. */
  rowsProcessed: number;
}

/**
 * Replaces every booking of the imported persons within the imported date range
 * and inserts the parsed rows, so re-importing the same export never duplicates
 * data. Also appends an entry to the import history.
 */
export const importTimeBookings = async (
  items: ParsedTimeBooking[],
  members: TeamMember[],
  sourceFileName: string,
  meta: TimeBookingImportMeta
): Promise<TimeBookingImportSummary> => {
  const persons = [...new Set(items.map((i) => i.person))];
  const dates = [...new Set(items.map((i) => i.workDate).filter((d): d is string => !!d))];

  let replaced = 0;
  let from: string | null = null;
  let to: string | null = null;
  if (persons.length && dates.length) {
    from = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
    to = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
    const { data: existing, error: countError } = await supabase
      .from("time_bookings")
      .select("id", { count: "exact" })
      .in("person", persons)
      .gte("work_date", from)
      .lte("work_date", to);
    if (countError) throw countError;
    replaced = existing?.length ?? 0;

    const { error: deleteError } = await supabase
      .from("time_bookings")
      .delete()
      .in("person", persons)
      .gte("work_date", from)
      .lte("work_date", to);
    if (deleteError) throw deleteError;
  }

  const rows = items.map((item) => ({
    work_date: item.workDate,
    person: item.person,
    member_id: matchMemberId(item.person, members),
    booking_no: item.bookingNo,
    duration: item.duration,
    organization: item.organization,
    project_code: item.projectCode,
    task_name: item.taskName,
    activity_kind: item.activityKind,
    activity_group: item.activityGroup,
    activity_type: item.activityType,
    remarks: item.remarks ?? null,
    delivery_no: item.deliveryNo ?? null,
    delivery_position: item.deliveryPosition ?? null,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("time_bookings").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }

  await recordImport({
    kind: "time_booking",
    sourceFileName,
    rangeFrom: from,
    rangeTo: to,
    rowsProcessed: meta.rowsProcessed,
    importedCount: rows.length,
    skippedCount: Math.max(meta.rowsProcessed - rows.length, 0),
    personsCount: meta.persons,
    projectsCount: meta.projects,
    rowErrors: meta.warnings,
  });

  return { imported: rows.length, replaced, persons: meta.persons, projects: meta.projects };
};

