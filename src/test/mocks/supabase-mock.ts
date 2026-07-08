// Test-only helper: build a Supabase client mock that serves mock-data rows to AppContext.
import { vi } from "vitest";
import { members as seedMembers, teams as seedTeams, workTopics as seedTopics, absences as seedAbsences, handovers as seedHandovers } from "@/data/mock-data";

const rows: Record<string, unknown[]> = {
  teams: seedTeams.map((t) => ({ id: t.id, name: t.name, icon: t.icon ?? "users", sort_order: 0 })),
  members: seedMembers.map((m) => ({
    id: m.id, team_id: m.teamId, name: m.name, role: m.role,
    avatar: m.avatar ?? null,
    base_capacity: m.baseCapacity ?? null,
    max_capacity: m.maxCapacity ?? null,
    login_name: m.loginName ?? null,
  })),
  work_topics: seedTopics.map((t) => ({
    id: t.id, member_id: t.memberId, name: t.name, description: t.description,
    status: t.status, reassigned_from: t.reassignedFrom ?? null,
  })),
  absences: seedAbsences.map((a) => ({
    id: a.id, member_id: a.memberId, type: a.type,
    start_date: a.startDate, end_date: a.endDate,
  })),
  handovers: seedHandovers.map((h) => ({
    id: h.id, from_member_id: h.fromMemberId, to_member_id: h.toMemberId,
    absence_id: h.absenceId, topic_ids: h.topicIds, notes: h.notes,
    handover_date: h.createdAt,
  })),
};

// A thenable that resolves with { data, error } and also exposes chain methods.
function tableQuery(table: string) {
  const data = rows[table] ?? [];
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data, error: null }),
  };
  return chain;
}

export const supabaseMock = {
  channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
  removeChannel: vi.fn(),
  from: (table: string) => tableQuery(table),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
};
