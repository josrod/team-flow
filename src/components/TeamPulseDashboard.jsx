import React, { useMemo, useState } from "react";
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

// ============================================================================
// Mock data — 16 members, 2 teams (RODAT, Processing)
// ============================================================================
const MEMBERS = [
  { id: "m1", name: "Carlos Ruiz", role: "Frontend Dev", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 38 },
  { id: "m2", name: "Lucía Hernández", role: "Backend Dev", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 44 },
  { id: "m3", name: "Pablo Martín", role: "QA", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 22 },
  { id: "m4", name: "Sofía Navarro", role: "DevOps", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 36 },
  { id: "m5", name: "Diego Torres", role: "Frontend Dev", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 41 },
  { id: "m6", name: "Marta Gil", role: "Backend Dev", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 30 },
  { id: "m7", name: "Jorge Vega", role: "QA", teamId: "rodat", baseCapacity: 32, maxCapacity: 40, effort: 18 },
  { id: "m8", name: "Elena Castro", role: "Tech Lead", teamId: "rodat", baseCapacity: 28, maxCapacity: 36, effort: 34 },
  { id: "m9", name: "Iván Romero", role: "Backend Dev", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 39 },
  { id: "m10", name: "Clara Ortega", role: "Data Engineer", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 42 },
  { id: "m11", name: "Andrés Mora", role: "DevOps", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 28 },
  { id: "m12", name: "Beatriz Soto", role: "QA", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 24 },
  { id: "m13", name: "Raúl Jiménez", role: "Data Engineer", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 33 },
  { id: "m14", name: "Nuria Pardo", role: "Backend Dev", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 37 },
  { id: "m15", name: "Héctor Silva", role: "Tech Lead", teamId: "processing", baseCapacity: 28, maxCapacity: 36, effort: 31 },
  { id: "m16", name: "Inés Crespo", role: "Frontend Dev", teamId: "processing", baseCapacity: 32, maxCapacity: 40, effort: 26 },
];

const TEAMS = [
  { id: "rodat", name: "RODAT", color: "#06d6a0" },
  { id: "processing", name: "Processing", color: "#4cc9f0" },
];

// Three currently absent (m3 vacation, m11 sick, m14 work-travel)
const ABSENCES = [
  { id: "a1", memberId: "m3", type: "vacation", startDate: dayOffset(-2), endDate: dayOffset(5) },
  { id: "a2", memberId: "m11", type: "sick-leave", startDate: dayOffset(0), endDate: dayOffset(3) },
  { id: "a3", memberId: "m14", type: "work-travel", startDate: dayOffset(-1), endDate: dayOffset(2) },
  // Future absences contributing to the 21-day forecast
  { id: "a4", memberId: "m5", type: "vacation", startDate: dayOffset(7), endDate: dayOffset(14) },
  { id: "a5", memberId: "m9", type: "parental-leave", startDate: dayOffset(10), endDate: dayOffset(20) },
  { id: "a6", memberId: "m12", type: "vacation", startDate: dayOffset(12), endDate: dayOffset(18) },
  { id: "a7", memberId: "m2", type: "work-travel", startDate: dayOffset(4), endDate: dayOffset(6) },
];

const HANDOVERS = [
  {
    id: "h1",
    fromName: "Pablo Martín",
    toName: "Jorge Vega",
    date: dayOffset(-2),
    topic: "Regression suite for sprint 42",
    absenceType: "vacation",
  },
  {
    id: "h2",
    fromName: "Andrés Mora",
    toName: "Sofía Navarro",
    date: dayOffset(0),
    topic: "Kubernetes node migration",
    absenceType: "sick-leave",
  },
  {
    id: "h3",
    fromName: "Nuria Pardo",
    toName: "Iván Romero",
    date: dayOffset(-1),
    topic: "Pricing API refactor",
    absenceType: "work-travel",
  },
];

// 4-week cumulative topic flow (backlog→pending→in-progress→completed)
const TOPIC_FLOW = [
  { week: "W-1", completed: 12, inProgress: 8, pending: 6, backlog: 4 },
  { week: "W0", completed: 18, inProgress: 10, pending: 7, backlog: 5 },
  { week: "W+1", completed: 24, inProgress: 12, pending: 9, backlog: 6 },
  { week: "W+2", completed: 31, inProgress: 11, pending: 8, backlog: 4 },
];

// ============================================================================
// Helpers
// ============================================================================
function dayOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function isMemberAbsentOn(memberId, iso, absences) {
  return absences.some(
    (a) => a.memberId === memberId && a.startDate <= iso && a.endDate >= iso
  );
}

const ABSENCE_COLORS = {
  vacation: "#a78bfa",
  "sick-leave": "#ef476f",
  "work-travel": "#06d6a0",
  "other-project": "#fbbf24",
  "parental-leave": "#f472b6",
};

const ABSENCE_LABELS = {
  vacation: "Vacaciones",
  "sick-leave": "Baja",
  "work-travel": "Viaje",
  "other-project": "Otro proyecto",
  "parental-leave": "Baja parental",
};

function utilColor(pct) {
  if (pct > 100) return "#ef476f";
  if (pct > 85) return "#fbbf24";
  return "#06d6a0";
}

// ============================================================================
// Styles
// ============================================================================
const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0a1a15 0%, #0f2620 100%)",
    color: "#e6f4ef",
    fontFamily:
      "'Outfit', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding: "32px 28px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
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
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
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
  tab: (active) => ({
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
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#6b8f82",
    marginBottom: 10,
  },
  kpiValue: (color) => ({
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
  cardDesc: {
    margin: "4px 0 16px",
    fontSize: 12,
    color: "#6b8f82",
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 18,
    marginBottom: 18,
  },
  legendRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 12,
    maxHeight: 200,
    overflowY: "auto",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
  },
  legendDot: (color) => ({
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
    flexWrap: "wrap",
  },
  typeBadge: (color) => ({
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
    flexWrap: "wrap",
  },
  avatar: (color) => ({
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
};

// ============================================================================
// Subcomponents
// ============================================================================
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

function Avatar({ name, color, strikethrough }) {
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

// ============================================================================
// Main component
// ============================================================================
function TeamPulseDashboard() {
  const [tab, setTab] = useState("pulse");
  const today = dayOffset(0);

  // ---- Derived data ----
  const absentMembers = useMemo(
    () => MEMBERS.filter((m) => isMemberAbsentOn(m.id, today, ABSENCES)),
    [today]
  );
  const availableMembers = useMemo(
    () => MEMBERS.filter((m) => !isMemberAbsentOn(m.id, today, ABSENCES)),
    [today]
  );

  const totalEffort = availableMembers.reduce((s, m) => s + m.effort, 0);
  const totalCapacity = availableMembers.reduce((s, m) => s + m.maxCapacity, 0);
  const teamUtilization = totalCapacity
    ? Math.round((totalEffort / totalCapacity) * 100)
    : 0;

  const handoverCount = HANDOVERS.length;
  const handoverCoverage = absentMembers.length
    ? Math.min(handoverCount, absentMembers.length)
    : 0;
  const coverageOk =
    absentMembers.length === 0 || handoverCoverage >= absentMembers.length;

  // Team utilization radial data
  const teamRadial = useMemo(() => {
    return TEAMS.map((t) => {
      const teamMembers = availableMembers.filter((m) => m.teamId === t.id);
      const effort = teamMembers.reduce((s, m) => s + m.effort, 0);
      const cap = teamMembers.reduce((s, m) => s + m.maxCapacity, 0);
      const pct = cap ? Math.round((effort / cap) * 100) : 0;
      return { name: t.name, value: pct, fill: t.color };
    });
  }, [availableMembers]);

  // Individual top-8 by utilization
  const individualRadial = useMemo(() => {
    return availableMembers
      .map((m) => {
        const pct = Math.round((m.effort / m.maxCapacity) * 100);
        return { name: m.name.split(" ")[0], fullName: m.name, value: pct, fill: utilColor(pct) };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [availableMembers]);

  // Absence forecast over next 21 days
  const forecast = useMemo(() => {
    const out = [];
    for (let i = 0; i < 21; i++) {
      const d = dayOffset(i);
      const count = MEMBERS.filter((m) =>
        isMemberAbsentOn(m.id, d, ABSENCES)
      ).length;
      out.push({ date: formatShortDate(d), count });
    }
    return out;
  }, []);

  // Effort by role
  const effortByRole = useMemo(() => {
    const map = new Map();
    for (const m of MEMBERS) {
      const e = map.get(m.role) || { role: m.role, effort: 0, capacity: 0 };
      e.effort += m.effort;
      e.capacity += m.maxCapacity;
      map.set(m.role, e);
    }
    return Array.from(map.values()).sort((a, b) => b.effort - a.effort);
  }, []);

  // ---- Render ----
  return (
    <div style={styles.root}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logoBox}>
            <PulseLogo />
          </div>
          <div>
            <h1 style={styles.title}>Team Pulse</h1>
            <div style={{ marginTop: 4 }}>
              <span style={styles.subtitleBadge}>
                {availableMembers.length} available · {absentMembers.length} absent
              </span>
            </div>
          </div>
        </div>
        <div style={styles.tabBar}>
          {[
            { id: "pulse", label: "Pulse" },
            { id: "flow", label: "Topic Flow" },
            { id: "handovers", label: "Handovers" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={styles.tab(tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI STRIP */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Team Utilization</div>
          <div style={styles.kpiValue(teamUtilization > 90 ? "#ef476f" : "#06d6a0")}>
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
            style={styles.kpiValue(absentMembers.length > 2 ? "#ef476f" : "#e6f4ef")}
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
        <>
          <div style={styles.twoCol}>
            {/* Team Utilization radial */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Team Utilization</h2>
              <p style={styles.cardDesc}>
                Effort vs capacity, semicircle view per team
              </p>
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
                    formatter={(v) => [`${v}%`, "Utilization"]}
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
            </div>

            {/* Individual Load radial */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Individual Load (Top 8)</h2>
              <p style={styles.cardDesc}>
                Most-loaded members sorted by utilization
              </p>
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
                    formatter={(v, _n, p) => [
                      `${v}%`,
                      p?.payload?.fullName || "Load",
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
                    <span
                      style={{
                        ...styles.monoNum,
                        color: m.fill,
                      }}
                    >
                      {m.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Absence forecast */}
          <div style={{ ...styles.card, marginBottom: 18 }}>
            <h2 style={styles.cardTitle}>Absence Forecast (21 days)</h2>
            <p style={styles.cardDesc}>
              Predicted absent member count derived from overlapping date ranges
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
                  formatter={(v) => [v, "Absent"]}
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
            <ResponsiveContainer width="100%" height={280}>
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
                  width={110}
                />
                <Tooltip
                  contentStyle={styles.tooltipStyle}
                  formatter={(v, n) => [`${v}h`, n === "capacity" ? "Capacity" : "Effort"]}
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
          </div>
        </>
      )}

      {/* TAB: TOPIC FLOW */}
      {tab === "flow" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Cumulative Topic Flow</h2>
          <p style={styles.cardDesc}>
            WorkTopic statuses stacked over time — visualizes bottlenecks and throughput
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={TOPIC_FLOW}>
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
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#9bbeb1", paddingTop: 12 }}
              />
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
                name="Backlog"
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
            Work topic reassignments during absences
          </p>
          <div>
            {HANDOVERS.map((h) => {
              const color = ABSENCE_COLORS[h.absenceType] || "#06d6a0";
              return (
                <div key={h.id} style={styles.handoverItem}>
                  <div style={styles.handoverHeader}>
                    <span style={styles.typeBadge(color)}>
                      {ABSENCE_LABELS[h.absenceType] || h.absenceType}
                    </span>
                    <span style={styles.monoNum}>{formatShortDate(h.date)}</span>
                  </div>
                  <div style={styles.flowRow}>
                    <Avatar name={h.fromName} color="#6b8f82" strikethrough />
                    <span style={{ color: color, fontSize: 18 }}>→</span>
                    <Avatar name={h.toName} color={color} />
                  </div>
                  <div style={styles.topicChip}>{h.topic}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamPulseDashboard;
