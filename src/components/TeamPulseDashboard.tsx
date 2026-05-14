import { useMemo, useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useApp } from "@/context/AppContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AbsenceType, TeamMember, WorkTopic } from "@/types";

// ----------------------------------------------------------------------------
// Constants & helpers
// ----------------------------------------------------------------------------
const TEAM_PALETTE = ["#06d6a0", "#4cc9f0", "#a78bfa", "#fbbf24", "#f472b6", "#f97316"];
const DEFAULT_TASK_HOURS = 8;
const FORECAST_DAYS = 21;

const ABSENCE_COLORS: Record<AbsenceType, string> = {
  vacation: "#a78bfa",
  "sick-leave": "#ef476f",
  "work-travel": "#06d6a0",
  "other-project": "#fbbf24",
  "parental-leave": "#f472b6",
};

const ABSENCE_LABELS: Record<AbsenceType, string> = {
  vacation: "Vacaciones",
  "sick-leave": "Baja",
  "work-travel": "Viaje",
  "other-project": "Otro proyecto",
  "parental-leave": "Baja parental",
};

function isoDayOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function isAbsentOn(
  memberId: string,
  iso: string,
  absences: { memberId: string; startDate: string; endDate: string }[]
): boolean {
  return absences.some(
    (a) => a.memberId === memberId && a.startDate <= iso && a.endDate >= iso
  );
}

function utilColor(pct: number): string {
  if (pct > 100) return "#ef476f";
  if (pct > 85) return "#fbbf24";
  return "#06d6a0";
}

// Derive effort (hours) from active work topics for a given member.
// Heuristic: each "in-progress" topic = full default load,
// each "pending" or "blocked" topic = half. Completed topics ignored.
function effortFromTopics(memberId: string, topics: WorkTopic[]): number {
  let hours = 0;
  for (const tp of topics) {
    if (tp.memberId !== memberId) continue;
    if (tp.status === "in-progress") hours += DEFAULT_TASK_HOURS;
    else if (tp.status === "pending" || tp.status === "blocked")
      hours += DEFAULT_TASK_HOURS / 2;
  }
  return hours;
}

function memberMaxCapacity(m: TeamMember): number {
  return m.maxCapacity ?? 40;
}

// ----------------------------------------------------------------------------
// Inline styles
// ----------------------------------------------------------------------------
const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0a1a15 0%, #0f2620 100%)",
    color: "#e6f4ef",
    fontFamily: "'Outfit', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding: "32px 28px",
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 20,
    marginBottom: 28,
  },
  brand: { display: "flex", alignItems: "center", gap: 14 },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #06d6a0 0%, #0aa478 100%)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 8px 24px rgba(6, 214, 160, 0.25)",
  },
  title: { margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" },
  subtitleBadge: {
    fontSize: 12,
    color: "#6b8f82",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    padding: "6px 12px",
    borderRadius: 999,
    fontFamily: "'JetBrains Mono', monospace",
  },
  tabBar: {
    display: "inline-flex",
    gap: 4,
    padding: 4,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 999,
  },
  tab: (active: boolean) => ({
    border: "none",
    background: active ? "#06d6a0" : "transparent",
    color: active ? "#062018" : "#9bbeb1",
    padding: "8px 18px",
    borderRadius: 999,
    fontWeight: active ? 600 : 500,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 160ms ease",
    fontFamily: "inherit",
  }),
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  kpiCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: "18px 20px",
  },
  kpiLabel: {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#6b8f82",
    marginBottom: 10,
  },
  kpiValue: (color?: string) => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 28,
    fontWeight: 600,
    color: color || "#e6f4ef",
    lineHeight: 1,
  }),
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 22,
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  cardDesc: { margin: "4px 0 16px", fontSize: 12, color: "#6b8f82" },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 18,
    marginBottom: 18,
  },
  legendRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    marginTop: 12,
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
  },
  legendDot: (color: string) => ({
    width: 10,
    height: 10,
    borderRadius: 3,
    background: color,
    flexShrink: 0,
  }),
  monoNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "#9bbeb1",
  },
  handoverItem: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  handoverHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap" as const,
  },
  typeBadge: (color: string) => ({
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 999,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  }),
  flowRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  avatar: (color: string) => ({
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: `${color}33`,
    color,
    display: "grid",
    placeItems: "center",
    fontWeight: 600,
    fontSize: 12,
    border: `1px solid ${color}55`,
    flexShrink: 0,
  }),
  topicChip: {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.04)",
    borderRadius: 10,
    fontSize: 13,
    color: "#cfe2db",
  },
  tooltipStyle: {
    background: "#0f2620",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    fontSize: 12,
  },
  emptyState: {
    padding: "32px 16px",
    textAlign: "center" as const,
    color: "#6b8f82",
    fontSize: 13,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 18,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 14,
  },
  filterLabel: {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#6b8f82",
    marginRight: 4,
  },
  filterChip: (color: string, active: boolean) => ({
    border: `1px solid ${active ? `${color}88` : "rgba(255,255,255,0.08)"}`,
    background: active ? `${color}22` : "transparent",
    color: active ? color : "#6b8f82",
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 140ms ease",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  }),
  filterDot: (color: string, active: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: active ? color : "rgba(255,255,255,0.15)",
  }),
  filterAction: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: "#06d6a0",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: "4px 8px",
  },
};

const ALL_ABSENCE_TYPES: AbsenceType[] = [
  "vacation",
  "sick-leave",
  "work-travel",
  "other-project",
  "parental-leave",
];

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------
function PulseLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12h4l2-6 4 12 3-8 2 4h5"
        stroke="#062018"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Avatar({
  name,
  color,
  strikethrough,
}: {
  name: string;
  color: string;
  strikethrough?: boolean;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div style={styles.flowRow}>
      <div style={styles.avatar(color)}>{initials}</div>
      <span
        style={{
          fontSize: 13,
          color: strikethrough ? "#6b8f82" : "#e6f4ef",
          fontWeight: strikethrough ? 400 : 600,
          textDecoration: strikethrough ? "line-through" : "none",
        }}
      >
        {name}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function TeamPulseDashboard() {
  const { teams, members, workTopics, absences, handovers } = useApp();
  const [tab, setTab] = useState<"pulse" | "flow" | "handovers">("pulse");
  const [selectedHandoverId, setSelectedHandoverId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | "all">("all");
  const [activeTypes, setActiveTypes] = useState<Set<AbsenceType>>(
    () => new Set(ALL_ABSENCE_TYPES)
  );

  const toggleType = (t: AbsenceType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const filteredAbsences = useMemo(
    () => absences.filter((a) => activeTypes.has(a.type as AbsenceType)),
    [absences, activeTypes]
  );

  const today = isoDayOffset(0);

  const membersById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const absencesById = useMemo(() => {
    const map = new Map<string, (typeof absences)[number]>();
    absences.forEach((a) => map.set(a.id, a));
    return map;
  }, [absences]);

  // Scope by selected team
  const scopedMembers = useMemo(
    () =>
      selectedTeamId === "all"
        ? members
        : members.filter((m) => m.teamId === selectedTeamId),
    [members, selectedTeamId]
  );
  const scopedTeams = useMemo(
    () =>
      selectedTeamId === "all"
        ? teams
        : teams.filter((t) => t.id === selectedTeamId),
    [teams, selectedTeamId]
  );
  const scopedMemberIds = useMemo(
    () => new Set(scopedMembers.map((m) => m.id)),
    [scopedMembers]
  );

  const absentMembers = useMemo(
    () => scopedMembers.filter((m) => isAbsentOn(m.id, today, filteredAbsences)),
    [scopedMembers, filteredAbsences, today]
  );
  const availableMembers = useMemo(
    () => scopedMembers.filter((m) => !isAbsentOn(m.id, today, filteredAbsences)),
    [scopedMembers, filteredAbsences, today]
  );

  const effortByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of scopedMembers) map.set(m.id, effortFromTopics(m.id, workTopics));
    return map;
  }, [scopedMembers, workTopics]);

  const totalEffort = availableMembers.reduce(
    (s, m) => s + (effortByMember.get(m.id) ?? 0),
    0
  );
  const totalCapacity = availableMembers.reduce(
    (s, m) => s + memberMaxCapacity(m),
    0
  );
  const teamUtilization = totalCapacity
    ? Math.round((totalEffort / totalCapacity) * 100)
    : 0;

  // Handover coverage for currently absent members
  const handoverCoverage = useMemo(() => {
    const coveredIds = new Set<string>();
    for (const h of handovers) {
      if (absentMembers.some((m) => m.id === h.fromMemberId)) {
        coveredIds.add(h.fromMemberId);
      }
    }
    return coveredIds.size;
  }, [handovers, absentMembers]);
  const coverageOk =
    absentMembers.length === 0 || handoverCoverage >= absentMembers.length;

  // ---- Team radial ----
  const teamRadial = useMemo(() => {
    return scopedTeams.map((t, i) => {
      const teamMembers = availableMembers.filter((m) => m.teamId === t.id);
      const effort = teamMembers.reduce(
        (s, m) => s + (effortByMember.get(m.id) ?? 0),
        0
      );
      const cap = teamMembers.reduce((s, m) => s + memberMaxCapacity(m), 0);
      const pct = cap ? Math.round((effort / cap) * 100) : 0;
      return {
        name: t.name,
        value: pct,
        fill: TEAM_PALETTE[i % TEAM_PALETTE.length],
      };
    });
  }, [scopedTeams, availableMembers, effortByMember]);

  // ---- Individual radial top 8 ----
  const individualRadial = useMemo(() => {
    return availableMembers
      .map((m) => {
        const effort = effortByMember.get(m.id) ?? 0;
        const cap = memberMaxCapacity(m);
        const pct = cap ? Math.round((effort / cap) * 100) : 0;
        return {
          fullName: m.name,
          name: m.name.split(" ")[0],
          value: pct,
          fill: utilColor(pct),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [availableMembers, effortByMember]);

  // ---- 21-day absence forecast ----
  const forecast = useMemo(() => {
    const out: { date: string; count: number }[] = [];
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const iso = isoDayOffset(i);
      const count = scopedMembers.filter((m) => isAbsentOn(m.id, iso, filteredAbsences))
        .length;
      out.push({ date: formatShortDate(iso), count });
    }
    return out;
  }, [scopedMembers, filteredAbsences]);

  // ---- Effort by role ----
  const effortByRole = useMemo(() => {
    const map = new Map<string, { role: string; effort: number; capacity: number }>();
    for (const m of scopedMembers) {
      const entry =
        map.get(m.role) ?? { role: m.role, effort: 0, capacity: 0 };
      entry.effort += effortByMember.get(m.id) ?? 0;
      entry.capacity += memberMaxCapacity(m);
      map.set(m.role, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.effort - a.effort);
  }, [scopedMembers, effortByMember]);

  // ---- Cumulative topic flow (4 weeks: W-1, W0, W+1, W+2) ----
  // We don't store historical snapshots, so use current counts as W0 and
  // simulate movement using absences active each week (proxy for throughput).
  const topicFlow = useMemo(() => {
    const scopedTopics = workTopics.filter((t) => scopedMemberIds.has(t.memberId));
    const current = {
      completed: scopedTopics.filter((t) => t.status === "completed").length,
      inProgress: scopedTopics.filter((t) => t.status === "in-progress").length,
      pending: scopedTopics.filter((t) => t.status === "pending").length,
      backlog: scopedTopics.filter((t) => t.status === "blocked").length,
    };

    const buildWeek = (offsetWeeks: number, label: string) => {
      // Simple proxy: throughput shrinks when more absences fall in that week.
      const weekStart = isoDayOffset(offsetWeeks * 7);
      const weekEnd = isoDayOffset(offsetWeeks * 7 + 6);
      const absentDaysInWeek = scopedMembers.reduce((sum, m) => {
        let days = 0;
        for (let d = 0; d < 7; d++) {
          const iso = isoDayOffset(offsetWeeks * 7 + d);
          if (isAbsentOn(m.id, iso, filteredAbsences)) days++;
        }
        return sum + days;
      }, 0);
      const stress = Math.min(1, absentDaysInWeek / Math.max(1, scopedMembers.length * 7));
      // Past weeks: less completed, more pending. Future weeks: more completed.
      const shift = offsetWeeks; // -1, 0, 1, 2
      return {
        week: label,
        completed: Math.max(
          0,
          Math.round(current.completed + shift * 2 - stress * 2)
        ),
        inProgress: Math.max(0, Math.round(current.inProgress - shift * 0.5)),
        pending: Math.max(0, Math.round(current.pending + stress * 2)),
        backlog: Math.max(0, Math.round(current.backlog + stress)),
      };
      // Note: weekStart/weekEnd are computed for future use (tooltip ranges).
      void weekStart;
      void weekEnd;
    };

    return [
      buildWeek(-1, "W-1"),
      buildWeek(0, "W0"),
      buildWeek(1, "W+1"),
      buildWeek(2, "W+2"),
    ];
  }, [workTopics, scopedMembers, scopedMemberIds, filteredAbsences]);

  // ---- Handover list ----
  const handoverList = useMemo(() => {
    return handovers
      .filter((h) => {
        const a = absencesById.get(h.absenceId);
        if (a && !activeTypes.has(a.type as AbsenceType)) return false;
        return (
          scopedMemberIds.has(h.fromMemberId) ||
          scopedMemberIds.has(h.toMemberId)
        );
      })
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((h) => {
        const fromMember = membersById.get(h.fromMemberId);
        const toMember = membersById.get(h.toMemberId);
        const absence = absencesById.get(h.absenceId);
        const topicNames = h.topicIds
          .map((tid) => workTopics.find((t) => t.id === tid)?.name)
          .filter((n): n is string => Boolean(n));
        return {
          id: h.id,
          fromName: fromMember?.name ?? "—",
          toName: toMember?.name ?? "—",
          date: h.createdAt.slice(0, 10),
          absenceType: (absence?.type ?? "vacation") as AbsenceType,
          notes: h.notes ?? "",
          topicNames,
          topicLabel:
            topicNames.length === 0
              ? h.notes || "Sin tareas asociadas"
              : topicNames.length === 1
              ? topicNames[0]
              : `${topicNames[0]} +${topicNames.length - 1} más`,
        };
      });
  }, [handovers, membersById, absencesById, workTopics, activeTypes, scopedMemberIds]);

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------
  const tabDefs = [
    { id: "pulse", label: "Pulse" },
    { id: "flow", label: "Topic Flow" },
    { id: "handovers", label: "Handovers" },
  ] as const;
  type TabId = (typeof tabDefs)[number]["id"];

  const handleTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const idx = tabDefs.findIndex((t) => t.id === tab);
    let nextIdx = idx;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabDefs.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabDefs.length) % tabDefs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabDefs.length - 1;
    const nextId = tabDefs[nextIdx].id;
    setTab(nextId);
    // Move focus to the newly-active tab
    requestAnimationFrame(() => {
      const btn = document.getElementById(`pulse-tab-${nextId}`);
      btn?.focus();
    });
  };

  return (
    <div style={styles.root}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logoBox} aria-hidden="true">
            <PulseLogo />
          </div>
          <div>
            <h1 style={styles.title}>Team Pulse</h1>
            <div style={{ marginTop: 4 }}>
              <span style={styles.subtitleBadge} aria-live="polite">
                {availableMembers.length} available · {absentMembers.length} absent
              </span>
            </div>
          </div>
        </div>
        <div style={styles.tabBar} role="tablist" aria-label="Dashboard sections">
          {tabDefs.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                id={`pulse-tab-${tb.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`pulse-panel-${tb.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(tb.id as TabId)}
                onKeyDown={handleTabKey}
                style={styles.tab(active)}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TEAM SELECTOR */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Team scope</span>
        {[{ id: "all", name: "All teams" }, ...teams].map((t) => {
          const active = selectedTeamId === t.id;
          const idx = teams.findIndex((x) => x.id === t.id);
          const color =
            t.id === "all"
              ? "#06d6a0"
              : TEAM_PALETTE[Math.max(0, idx) % TEAM_PALETTE.length];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTeamId(t.id)}
              style={styles.filterChip(color, active)}
              aria-pressed={active}
            >
              <span style={styles.filterDot(color, active)} />
              {t.name}
            </button>
          );
        })}
        <span style={{ ...styles.monoNum, marginLeft: "auto" }}>
          {scopedMembers.length} members
        </span>
      </div>

      {/* ABSENCE TYPE FILTERS */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Absence types</span>
        {ALL_ABSENCE_TYPES.map((t) => {
          const active = activeTypes.has(t);
          const color = ABSENCE_COLORS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={styles.filterChip(color, active)}
              aria-pressed={active}
            >
              <span style={styles.filterDot(color, active)} />
              {ABSENCE_LABELS[t]}
            </button>
          );
        })}
        {activeTypes.size < ALL_ABSENCE_TYPES.length ? (
          <button
            type="button"
            onClick={() => setActiveTypes(new Set(ALL_ABSENCE_TYPES))}
            style={styles.filterAction}
          >
            Mostrar todos
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTypes(new Set())}
            style={{ ...styles.filterAction, color: "#6b8f82" }}
          >
            Ocultar todos
          </button>
        )}
      </div>

      {/* KPI STRIP */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Team Utilization</div>
          <div
            style={styles.kpiValue(teamUtilization > 90 ? "#ef476f" : "#06d6a0")}
          >
            {teamUtilization}%
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Effort</div>
          <div style={styles.kpiValue()}>
            {totalEffort}
            <span style={{ fontSize: 14, color: "#6b8f82", marginLeft: 4 }}>h</span>
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Capacity</div>
          <div style={styles.kpiValue()}>
            {totalCapacity}
            <span style={{ fontSize: 14, color: "#6b8f82", marginLeft: 4 }}>h</span>
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Absent Today</div>
          <div
            style={styles.kpiValue(
              absentMembers.length > 2 ? "#ef476f" : "#e6f4ef"
            )}
          >
            {absentMembers.length}
          </div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Handover Coverage</div>
          <div style={styles.kpiValue(coverageOk ? "#06d6a0" : "#ef476f")}>
            {handoverCoverage}
            <span style={{ fontSize: 18, color: "#6b8f82" }}>
              /{absentMembers.length}
            </span>
          </div>
        </div>
      </div>

      {/* TAB: PULSE */}
      {tab === "pulse" && (
        <section
          id="pulse-panel-pulse"
          role="tabpanel"
          aria-labelledby="pulse-tab-pulse"
        >
          <div style={styles.twoCol}>
            {/* Team Utilization radial */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Team Utilization</h2>
              <p style={styles.cardDesc}>
                Effort vs capacity per team
              </p>
              {teamRadial.length === 0 ? (
                <div style={styles.emptyState}>No teams configured</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadialBarChart
                      innerRadius="40%"
                      outerRadius="100%"
                      data={teamRadial}
                      startAngle={180}
                      endAngle={0}
                      cx="50%"
                      cy="90%"
                    >
                      <RadialBar
                        dataKey="value"
                        cornerRadius={8}
                        background={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      <Tooltip
                        contentStyle={styles.tooltipStyle}
                        formatter={(v: number) => [`${v}%`, "Utilization"]}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div style={styles.legendRow}>
                    {teamRadial.map((t) => (
                      <div key={t.name} style={styles.legendItem}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={styles.legendDot(t.fill)} />
                          <span>{t.name}</span>
                        </div>
                        <span style={styles.monoNum}>{t.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Individual Load radial */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Individual Load (Top 8)</h2>
              <p style={styles.cardDesc}>
                Most-loaded available members sorted by utilization
              </p>
              {individualRadial.length === 0 ? (
                <div style={styles.emptyState}>No available members</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadialBarChart
                      innerRadius="25%"
                      outerRadius="100%"
                      data={individualRadial}
                      startAngle={180}
                      endAngle={0}
                      cx="50%"
                      cy="90%"
                    >
                      <RadialBar
                        dataKey="value"
                        cornerRadius={6}
                        background={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      <Tooltip
                        contentStyle={styles.tooltipStyle}
                        formatter={(v: number, _n, p) => [
                          `${v}%`,
                          (p as { payload?: { fullName?: string } })?.payload
                            ?.fullName || "Load",
                        ]}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div style={styles.legendRow}>
                    {individualRadial.map((m) => (
                      <div key={m.fullName} style={styles.legendItem}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={styles.legendDot(m.fill)} />
                          <span>{m.fullName}</span>
                        </div>
                        <span style={{ ...styles.monoNum, color: m.fill }}>
                          {m.value}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Absence forecast */}
          <div style={{ ...styles.card, marginBottom: 18 }}>
            <h2 style={styles.cardTitle}>Absence Forecast (21 days)</h2>
            <p style={styles.cardDesc}>
              Predicted absent member count from overlapping date ranges
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={forecast}>
                <defs>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef476f" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ef476f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b8f82", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#6b8f82", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={styles.tooltipStyle}
                  formatter={(v: number) => [v, "Absent"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#ef476f"
                  strokeWidth={2}
                  fill="url(#forecastFill)"
                  dot={{ fill: "#ef476f", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Effort by role */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Effort by Role</h2>
            <p style={styles.cardDesc}>
              Capacity vs actual effort grouped by discipline
            </p>
            {effortByRole.length === 0 ? (
              <div style={styles.emptyState}>No member data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, effortByRole.length * 48)}>
                <BarChart
                  data={effortByRole}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6b8f82", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="role"
                    tick={{ fill: "#9bbeb1", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={130}
                  />
                  <Tooltip
                    contentStyle={styles.tooltipStyle}
                    formatter={(v: number, n) => [
                      `${v}h`,
                      n === "capacity" ? "Capacity" : "Effort",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: "#9bbeb1" }}
                    formatter={(v) => (v === "capacity" ? "Capacity" : "Effort")}
                  />
                  <Bar
                    dataKey="capacity"
                    fill="rgba(255,255,255,0.08)"
                    radius={[0, 6, 6, 0]}
                    barSize={10}
                  />
                  <Bar
                    dataKey="effort"
                    fill="#06d6a0"
                    radius={[0, 6, 6, 0]}
                    barSize={10}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}

      {/* TAB: TOPIC FLOW */}
      {tab === "flow" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Cumulative Topic Flow</h2>
          <p style={styles.cardDesc}>
            WorkTopic statuses stacked over time — historical snapshots are simulated; W0 is current
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={topicFlow}>
              <defs>
                <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06d6a0" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#06d6a0" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="gInProgress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4cc9f0" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#4cc9f0" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="gPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="gBacklog" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef476f" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#ef476f" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fill: "#6b8f82", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6b8f82", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <Tooltip contentStyle={styles.tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9bbeb1", paddingTop: 12 }} />
              <Area
                type="monotone"
                stackId="1"
                dataKey="completed"
                name="Completed"
                stroke="#06d6a0"
                fill="url(#gCompleted)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="inProgress"
                name="In progress"
                stroke="#4cc9f0"
                fill="url(#gInProgress)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="pending"
                name="Pending"
                stroke="#fbbf24"
                fill="url(#gPending)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="backlog"
                name="Blocked"
                stroke="#ef476f"
                fill="url(#gBacklog)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TAB: HANDOVERS */}
      {tab === "handovers" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Active Handovers</h2>
          <p style={styles.cardDesc}>
            Work topic reassignments during absences — click any item for details
          </p>
          {handoverList.length === 0 ? (
            <div style={styles.emptyState}>No handovers registered yet</div>
          ) : (
            <div>
              {handoverList.map((h) => {
                const color = ABSENCE_COLORS[h.absenceType] || "#06d6a0";
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedHandoverId(h.id)}
                    style={{
                      ...styles.handoverItem,
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "#e6f4ef",
                    }}
                    aria-label={`Open handover from ${h.fromName} to ${h.toName}`}
                  >
                    <div style={styles.handoverHeader}>
                      <span style={styles.typeBadge(color)}>
                        {ABSENCE_LABELS[h.absenceType] || h.absenceType}
                      </span>
                      <span style={styles.monoNum}>{formatShortDate(h.date)}</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: "#6b8f82",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Ver detalles →
                      </span>
                    </div>
                    <div style={styles.flowRow}>
                      <Avatar name={h.fromName} color="#6b8f82" strikethrough />
                      <span style={{ color, fontSize: 18 }}>→</span>
                      <Avatar name={h.toName} color={color} />
                    </div>
                    <div style={styles.topicChip}>{h.topicLabel}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HANDOVER DETAIL DRAWER */}
      <Sheet
        open={selectedHandoverId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedHandoverId(null);
        }}
      >
        <SheetContent
          side="right"
          className="border-l-0 sm:max-w-md"
          style={{
            background: "linear-gradient(160deg, #0a1a15 0%, #0f2620 100%)",
            color: "#e6f4ef",
            fontFamily:
              "'Outfit', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {(() => {
            const detail = handoverList.find((h) => h.id === selectedHandoverId);
            if (!detail) return null;
            const color = ABSENCE_COLORS[detail.absenceType] || "#06d6a0";
            return (
              <>
                <SheetHeader>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={styles.typeBadge(color)}>
                      {ABSENCE_LABELS[detail.absenceType] || detail.absenceType}
                    </span>
                    <span style={styles.monoNum}>
                      {formatShortDate(detail.date)}
                    </span>
                  </div>
                  <SheetTitle style={{ color: "#e6f4ef", marginTop: 12 }}>
                    Handover detail
                  </SheetTitle>
                  <SheetDescription style={{ color: "#6b8f82" }}>
                    Reassignment from {detail.fromName} to {detail.toName}
                  </SheetDescription>
                </SheetHeader>

                <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 22 }}>
                  <div>
                    <div style={styles.kpiLabel}>Flow</div>
                    <div style={{ ...styles.flowRow, marginTop: 8 }}>
                      <Avatar name={detail.fromName} color="#6b8f82" strikethrough />
                      <span style={{ color, fontSize: 18 }}>→</span>
                      <Avatar name={detail.toName} color={color} />
                    </div>
                  </div>

                  <div>
                    <div style={styles.kpiLabel}>
                      Topics ({detail.topicNames.length})
                    </div>
                    {detail.topicNames.length === 0 ? (
                      <div style={{ ...styles.topicChip, marginTop: 8 }}>
                        No topics associated with this handover
                      </div>
                    ) : (
                      <ul
                        style={{
                          listStyle: "none",
                          padding: 0,
                          margin: "8px 0 0",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {detail.topicNames.map((name, i) => (
                          <li
                            key={`${name}-${i}`}
                            style={{
                              ...styles.topicChip,
                              marginTop: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                ...styles.monoNum,
                                color: "#6b8f82",
                                minWidth: 22,
                              }}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>{name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div style={styles.kpiLabel}>Notes</div>
                    <div
                      style={{
                        ...styles.topicChip,
                        marginTop: 8,
                        whiteSpace: "pre-wrap",
                        color: detail.notes ? "#cfe2db" : "#6b8f82",
                        fontStyle: detail.notes ? "normal" : "italic",
                      }}
                    >
                      {detail.notes || "No notes added for this handover"}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default TeamPulseDashboard;
