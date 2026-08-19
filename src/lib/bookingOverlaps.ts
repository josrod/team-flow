import type { Absence, AbsenceType, TeamMember } from "@/types";

/** Minimal booking shape needed to detect overlaps, so this stays pure and testable. */
export interface OverlapBooking {
  workDate: string | null;
  person: string;
  memberId?: string | null;
  duration: number;
  projectCode: string;
}

export interface BookingAbsenceOverlap {
  key: string;
  memberId: string;
  memberName: string;
  person: string;
  date: string;
  absenceId: string;
  absenceType: AbsenceType;
  bookedHours: number;
  bookings: number;
  projects: string[];
}

/**
 * Absence types where booked effort is contradictory. Business trips are
 * excluded on purpose: people do book hours while travelling.
 */
export const CONFLICTING_ABSENCE_TYPES: AbsenceType[] = ["vacation", "sick-leave"];

const resolveMemberId = (booking: OverlapBooking, members: TeamMember[]): string | null => {
  if (booking.memberId) return booking.memberId;
  const person = booking.person.toLowerCase().trim();
  if (!person) return null;
  const byLogin = members.find((m) => m.loginName && m.loginName.toLowerCase() === person);
  if (byLogin) return byLogin.id;
  return members.find((m) => m.name.toLowerCase() === person)?.id ?? null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Finds days where a person is registered as absent and still has booked hours,
 * grouped by person and day.
 */
export const findBookingAbsenceOverlaps = (
  absences: Absence[],
  bookings: OverlapBooking[],
  members: TeamMember[],
  conflictingTypes: AbsenceType[] = CONFLICTING_ABSENCE_TYPES
): BookingAbsenceOverlap[] => {
  const relevant = absences.filter((a) => conflictingTypes.includes(a.type));
  if (relevant.length === 0) return [];

  const overlaps = new Map<string, BookingAbsenceOverlap>();

  for (const booking of bookings) {
    if (!booking.workDate || booking.duration <= 0) continue;
    const memberId = resolveMemberId(booking, members);
    if (!memberId) continue;

    const absence = relevant.find(
      (a) => a.memberId === memberId && a.startDate <= booking.workDate! && a.endDate >= booking.workDate!
    );
    if (!absence) continue;

    const key = `${memberId}|${booking.workDate}`;
    const entry = overlaps.get(key);
    if (entry) {
      entry.bookedHours = round2(entry.bookedHours + booking.duration);
      entry.bookings += 1;
      if (booking.projectCode && !entry.projects.includes(booking.projectCode)) {
        entry.projects.push(booking.projectCode);
      }
      continue;
    }

    overlaps.set(key, {
      key,
      memberId,
      memberName: members.find((m) => m.id === memberId)?.name ?? booking.person,
      person: booking.person,
      date: booking.workDate,
      absenceId: absence.id,
      absenceType: absence.type,
      bookedHours: round2(booking.duration),
      bookings: 1,
      projects: booking.projectCode ? [booking.projectCode] : [],
    });
  }

  return [...overlaps.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.memberName.localeCompare(b.memberName)
  );
};
