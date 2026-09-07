// Pure aggregation for the "per person" panel: joins live TFS backlog cards,
// booked hours (INVENT import), absences and blockers into one row per member,
// plus weekly KPIs with a delta against the previous week.

import { completionRatio, type BacklogCardItem } from "@/lib/backlogBoard";
import { isoWeekKey, isoWeekRange, previousIsoWeekKey, workingDaysBetween } from "@/lib/isoWeek";

export interface PanelMember {
  id: string;
  name: string;
  teamId: string;
}

export interface PanelAbsence {
  memberId: string;
  type: string;
  startDate: string;
  endDate: string;
}

export interface PanelBooking {
  person: string;
  memberId: string | null;
  workDate: string | null;
  duration: number;
}

export interface PanelAlert {
  itemId: number;
  kind: string;
  person?: string;
}

export type PersonRisk = "high" | "medium" | "none";

export interface PersonPanelRow {
  memberId: string;
  name: string;
  teamId: string;
  cards: BacklogCardItem[];
  itemsTotal: number;
  itemsActive: number;
  itemsInProgress: number;
  itemsClosedInWeek: number;
  childrenActive: number;
  childrenDone: number;
  childrenTotal: number;
  /** Average completion of active items with child tasks. */
  progressPercent: number | null;
  readyToClose: number;
  waiting: number;
  hours: number;
  hoursPreviousWeek: number;
  hoursDelta: number;
  absenceDays: number;
  absenceTypes: string[];
  blockers: number;
  risk: PersonRisk;
}

export interface PersonPanelKpis {
  people: number;
  hours: number;
  hoursPreviousWeek: number;
  hoursDelta: number;
  closedItems: number;
  closedItemsPreviousWeek: number;
  averageProgress: number | null;
  blockers: number;
  atRisk: number;
}

export interface PersonPanelResult {
  weekKey: string;
  weekFrom: string;
  weekTo: string;
  rows: PersonPanelRow[];
  kpis: PersonPanelKpis;
}

export interface BuildPersonPanelInput {
  members: readonly PanelMember[];
  cards: readonly BacklogCardItem[];
  alerts: readonly PanelAlert[];
  bookings: readonly PanelBooking[];
  absences: readonly PanelAbsence[];
  weekKey: string;
  /** Resolves a TFS assignee or booking person name to an internal member id. */
  memberIdFor: (person: string) => string | null;
  /** Expected booked hours per full working week. Defaults to 40. */
  targetWeeklyHours?: number;
}

const ACTIVE_COLUMNS = new Set(["open", "refinement", "inProgress", "testing"]);

const round1 = (value: number): number => Math.round(value * 10) / 10;

const inWeek = (iso: string | undefined, from: string, to: string): boolean =>
  !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;

/** Member ids a backlog card should be attributed to (owner, else child owners). */
export const cardMemberIds = (
  card: BacklogCardItem,
  memberIdFor: (person: string) => string | null,
): string[] => {
  const owner = card.assignedTo?.trim();
  if (owner) {
    const id = memberIdFor(owner);
    return id ? [id] : [];
  }
  const ids = new Set<string>();
  card.children.forEach((child) => {
    const name = child.assignedTo?.trim();
    if (!name) return;
    const id = memberIdFor(name);
    if (id) ids.add(id);
  });
  return [...ids];
};

/** Working days of a member's absences that fall inside the given week. */
export const absenceDaysInWeek = (
  absences: readonly PanelAbsence[],
  from: string,
  to: string,
): { days: number; types: string[] } => {
  let days = 0;
  const types = new Set<string>();
  absences.forEach((absence) => {
    const start = absence.startDate > from ? absence.startDate : from;
    const end = absence.endDate < to ? absence.endDate : to;
    if (start > end) return;
    const overlap = workingDaysBetween(start, end);
    if (overlap <= 0) return;
    days += overlap;
    types.add(absence.type);
  });
  return { days: Math.min(days, 5), types: [...types] };
};

const riskFor = (
  row: Omit<PersonPanelRow, "risk">,
  expectedHours: number,
): PersonRisk => {
  const lowProgress = row.progressPercent !== null && row.progressPercent < 30;
  const noHours = expectedHours > 0 && row.hours === 0 && row.itemsActive > 0;
  const lowHours = expectedHours > 0 && row.hours < expectedHours * 0.6 && row.itemsActive > 0;
  if (row.blockers > 0 && (lowProgress || noHours)) return "high";
  if (noHours) return "high";
  if (row.blockers > 0 || lowHours || lowProgress) return "medium";
  return "none";
};

/** Builds the per-person rows and weekly KPIs for the given ISO week. */
export const buildPersonPanel = ({
  members,
  cards,
  alerts,
  bookings,
  absences,
  weekKey,
  memberIdFor,
  targetWeeklyHours = 40,
}: BuildPersonPanelInput): PersonPanelResult => {
  const { from, to } = isoWeekRange(weekKey);
  const previousWeek = previousIsoWeekKey(weekKey);
  const previousRange = isoWeekRange(previousWeek);

  const cardsByMember = new Map<string, BacklogCardItem[]>();
  cards.forEach((card) => {
    cardMemberIds(card, memberIdFor).forEach((id) => {
      const list = cardsByMember.get(id) ?? [];
      if (!list.some((existing) => existing.id === card.id)) list.push(card);
      cardsByMember.set(id, list);
    });
  });

  const hoursByMember = new Map<string, number>();
  const previousHoursByMember = new Map<string, number>();
  bookings.forEach((booking) => {
    if (!booking.workDate) return;
    const id = booking.memberId ?? memberIdFor(booking.person);
    if (!id) return;
    const key = isoWeekKey(booking.workDate);
    const target = key === weekKey ? hoursByMember : key === previousWeek ? previousHoursByMember : null;
    if (!target) return;
    target.set(id, (target.get(id) ?? 0) + booking.duration);
  });

  const absencesByMember = new Map<string, PanelAbsence[]>();
  absences.forEach((absence) => {
    const list = absencesByMember.get(absence.memberId) ?? [];
    list.push(absence);
    absencesByMember.set(absence.memberId, list);
  });

  const blockersByMember = new Map<string, Set<number>>();
  alerts.forEach((alert) => {
    const person = alert.person?.trim();
    if (!person) return;
    const id = memberIdFor(person);
    if (!id) return;
    const set = blockersByMember.get(id) ?? new Set<number>();
    set.add(alert.itemId);
    blockersByMember.set(id, set);
  });

  const rows: PersonPanelRow[] = members.map((member) => {
    const memberCards = (cardsByMember.get(member.id) ?? []).slice().sort((a, b) => b.id - a.id);
    const active = memberCards.filter((card) => ACTIVE_COLUMNS.has(card.column));
    const withChildren = active.filter((card) => card.childrenTotal > 0);
    const progressPercent =
      withChildren.length === 0
        ? null
        : Math.round(
            (withChildren.reduce((sum, card) => sum + (completionRatio(card) ?? 0), 0) /
              withChildren.length) *
              100,
          );
    const { days: absenceDays, types: absenceTypes } = absenceDaysInWeek(
      absencesByMember.get(member.id) ?? [],
      from,
      to,
    );
    const hours = round1(hoursByMember.get(member.id) ?? 0);
    const hoursPreviousWeek = round1(previousHoursByMember.get(member.id) ?? 0);
    const expectedHours = (targetWeeklyHours / 5) * Math.max(0, 5 - absenceDays);

    const base: Omit<PersonPanelRow, "risk"> = {
      memberId: member.id,
      name: member.name,
      teamId: member.teamId,
      cards: memberCards,
      itemsTotal: memberCards.length,
      itemsActive: active.length,
      itemsInProgress: memberCards.filter((card) => card.column === "inProgress").length,
      itemsClosedInWeek: memberCards.filter(
        (card) => card.column === "closed" && inWeek(card.closedDate ?? card.changedDate, from, to),
      ).length,
      childrenActive: memberCards.reduce(
        (sum, card) => sum + card.children.filter((child) => ACTIVE_COLUMNS.has(child.column)).length,
        0,
      ),
      childrenDone: active.reduce((sum, card) => sum + card.childrenDone, 0),
      childrenTotal: active.reduce((sum, card) => sum + card.childrenTotal, 0),
      progressPercent,
      readyToClose: withChildren.filter((card) => card.childrenDone === card.childrenTotal).length,
      waiting: active.filter((card) => card.waiting).length,
      hours,
      hoursPreviousWeek,
      hoursDelta: round1(hours - hoursPreviousWeek),
      absenceDays,
      absenceTypes,
      blockers: blockersByMember.get(member.id)?.size ?? 0,
    };

    return { ...base, risk: riskFor(base, expectedHours) };
  });

  const closedItemsPreviousWeek = new Set(
    cards
      .filter(
        (card) =>
          card.column === "closed" &&
          inWeek(card.closedDate ?? card.changedDate, previousRange.from, previousRange.to) &&
          cardMemberIds(card, memberIdFor).length > 0,
      )
      .map((card) => card.id),
  ).size;

  const progressValues = rows
    .map((row) => row.progressPercent)
    .filter((value): value is number => value !== null);
  const hours = round1(rows.reduce((sum, row) => sum + row.hours, 0));
  const hoursPreviousWeek = round1(rows.reduce((sum, row) => sum + row.hoursPreviousWeek, 0));

  const kpis: PersonPanelKpis = {
    people: rows.length,
    hours,
    hoursPreviousWeek,
    hoursDelta: round1(hours - hoursPreviousWeek),
    closedItems: new Set(
      rows.flatMap((row) =>
        row.cards
          .filter(
            (card) => card.column === "closed" && inWeek(card.closedDate ?? card.changedDate, from, to),
          )
          .map((card) => card.id),
      ),
    ).size,
    closedItemsPreviousWeek,
    averageProgress:
      progressValues.length === 0
        ? null
        : Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length),
    blockers: rows.reduce((sum, row) => sum + row.blockers, 0),
    atRisk: rows.filter((row) => row.risk !== "none").length,
  };

  return { weekKey, weekFrom: from, weekTo: to, rows, kpis };
};

export type PersonPanelSort = "risk" | "progress" | "hours" | "blockers" | "name";

const riskWeight: Record<PersonRisk, number> = { high: 2, medium: 1, none: 0 };

/** Sorts rows so the people falling behind surface first. */
export const sortPersonRows = (
  rows: readonly PersonPanelRow[],
  sort: PersonPanelSort,
): PersonPanelRow[] => {
  const list = rows.slice();
  switch (sort) {
    case "progress":
      return list.sort(
        (a, b) => (a.progressPercent ?? 101) - (b.progressPercent ?? 101) || a.name.localeCompare(b.name),
      );
    case "hours":
      return list.sort((a, b) => a.hours - b.hours || a.name.localeCompare(b.name));
    case "blockers":
      return list.sort((a, b) => b.blockers - a.blockers || a.name.localeCompare(b.name));
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return list.sort(
        (a, b) =>
          riskWeight[b.risk] - riskWeight[a.risk] ||
          b.blockers - a.blockers ||
          a.hours - b.hours ||
          a.name.localeCompare(b.name),
      );
  }
};
