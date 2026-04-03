import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Users, UserCheck, ArrowRightLeft, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function AnalyticsPanel() {
  const { teams, members, absences, handovers, getMemberStatus } = useApp();
  const { t } = useLang();

  const today = new Date().toISOString().split("T")[0];

  const metrics = useMemo(() => {
    const totalMembers = members.length;
    const availableCount = members.filter((m) => getMemberStatus(m.id) === "available").length;
    const capacityPct = totalMembers > 0 ? Math.round((availableCount / totalMembers) * 100) : 0;

    const activeAbsences = absences.filter((a) => a.startDate <= today && a.endDate >= today);
    const absencesWithHandover = activeAbsences.filter((a) =>
      handovers.some((h) => h.absenceId === a.id)
    );
    const handoverRate = activeAbsences.length > 0
      ? Math.round((absencesWithHandover.length / activeAbsences.length) * 100)
      : 100;

    const activeHandovers = handovers.filter((h) => {
      const absence = absences.find((a) => a.id === h.absenceId);
      return absence && absence.endDate >= today;
    });

    return { totalMembers, availableCount, capacityPct, handoverRate, activeHandovers: activeHandovers.length, totalAbsences: activeAbsences.length };
  }, [members, absences, handovers, getMemberStatus, today]);

  // Team capacity bar chart data
  const teamCapacityData = useMemo(() => {
    return teams.map((team) => {
      const teamMembers = members.filter((m) => m.teamId === team.id);
      const available = teamMembers.filter((m) => getMemberStatus(m.id) === "available").length;
      const absent = teamMembers.length - available;
      return { name: team.name.length > 10 ? team.name.slice(0, 10) + "…" : team.name, available, absent };
    });
  }, [teams, members, getMemberStatus]);

  // Absence type pie chart
  const absenceTypeData = useMemo(() => {
    const activeAbsences = absences.filter((a) => a.startDate <= today && a.endDate >= today);
    const counts: { name: string; value: number; fill: string }[] = [
      { name: t.vacation, value: activeAbsences.filter((a) => a.type === "vacation").length, fill: "hsl(var(--status-vacation))" },
      { name: t.sickLeave, value: activeAbsences.filter((a) => a.type === "sick-leave").length, fill: "hsl(var(--status-sick))" },
      { name: t.workTravel, value: activeAbsences.filter((a) => a.type === "work-travel").length, fill: "hsl(var(--status-work-travel))" },
      { name: t.otherProject, value: activeAbsences.filter((a) => a.type === "other-project").length, fill: "hsl(var(--status-other-project))" },
      { name: t.parentalLeave, value: activeAbsences.filter((a) => a.type === "parental-leave").length, fill: "hsl(var(--status-parental-leave))" },
    ];
    return counts.filter((d) => d.value > 0);
  }, [absences, today, t]);

  // Absence trend: next 14 days
  const absenceTrendData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = -7; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const count = absences.filter((a) => a.startDate <= iso && a.endDate >= iso).length;
      days.push({ date: iso, label: `${d.getDate()}/${d.getMonth() + 1}`, count });
    }
    return days;
  }, [absences]);

  const capacityChartConfig: ChartConfig = {
    available: { label: t.available, color: "hsl(var(--status-available))" },
    absent: { label: t.absent, color: "hsl(var(--status-vacation))" },
  };

  const trendChartConfig: ChartConfig = {
    count: { label: t.absent, color: "hsl(var(--primary))" },
  };

  const pieChartConfig: ChartConfig = {
    vacation: { label: t.vacation, color: "hsl(var(--status-vacation))" },
    sickLeave: { label: t.sickLeave, color: "hsl(var(--status-sick))" },
  };

  const summaryCards = [
    { label: t.analyticsCapacity, value: `${metrics.capacityPct}%`, sub: `${metrics.availableCount}/${metrics.totalMembers}`, icon: Users, color: "text-primary" },
    { label: t.analyticsHandoverRate, value: `${metrics.handoverRate}%`, sub: `${metrics.activeHandovers} ${t.analyticsActive}`, icon: ArrowRightLeft, color: "text-status-available" },
    { label: t.analyticsActiveAbsences, value: String(metrics.totalAbsences), sub: t.analyticsCurrently, icon: UserCheck, color: "text-status-vacation" },
  ];

  return (
    <div className="space-y-6">
      <motion.div variants={item}>
        <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          {t.analyticsTitle}
        </h2>
      </motion.div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <motion.div key={card.label} variants={item}>
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                    <p className={`text-2xl font-bold font-display ${card.color}`}>{card.value}</p>
                    <p className="text-[11px] text-muted-foreground">{card.sub}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Team capacity */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t.analyticsTeamCapacity}</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {teamCapacityData.length > 0 ? (
                <ChartContainer config={capacityChartConfig} className="h-[200px] w-full">
                  <BarChart data={teamCapacityData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="available" stackId="a" fill="hsl(var(--status-available))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="absent" stackId="a" fill="hsl(var(--status-vacation))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t.analyticsNoData}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Absence type breakdown */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t.analyticsAbsenceType}</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {absenceTypeData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ChartContainer config={pieChartConfig} className="h-[200px] w-[200px] shrink-0">
                    <PieChart>
                      <Pie
                        data={absenceTypeData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        strokeWidth={2}
                        stroke="hsl(var(--card))"
                      >
                        {absenceTypeData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="space-y-3">
                    {absenceTypeData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.fill }} />
                        <span className="text-sm text-muted-foreground">{entry.name}</span>
                        <span className="text-sm font-bold font-display ml-auto tabular-nums">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t.analyticsNoAbsences}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Absence trend area chart */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t.analyticsAbsenceTrend}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ChartContainer config={trendChartConfig} className="h-[180px] w-full">
              <AreaChart data={absenceTrendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="absenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#absenceGradient)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}