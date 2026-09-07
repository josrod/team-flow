import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ListChecks, ShieldAlert, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useLang } from "@/context/LanguageContext";
import { formatHours } from "@/lib/inventValues";
import type { PersonPanelKpis } from "@/lib/personPanel";

interface PersonKpiCardsProps {
  kpis: PersonPanelKpis;
}

const formatDelta = (value: number, suffix = ""): string =>
  `${value > 0 ? "+" : ""}${String(value).replace(".", ",")}${suffix}`;

/** Weekly KPI cards with a delta against the previous week. */
export const PersonKpiCards = ({ kpis }: PersonKpiCardsProps) => {
  const { t } = useLang();

  const cards = [
    {
      key: "planCapacity",
      icon: CalendarClock,
      label: t.personPanelKpiPlanCapacity,
      value: formatHours(kpis.plannedCapacityHours),
    },
    {
      key: "planEstimate",
      icon: ListChecks,
      label: t.personPanelKpiPlanEstimate,
      value: formatHours(kpis.plannedEstimateHours),
    },
    {
      key: "hours",
      icon: Clock,
      label: t.personPanelKpiHours,
      value: formatHours(kpis.hours),
      delta: formatDelta(kpis.hoursDelta, " h"),
      positive: kpis.hoursDelta >= 0,
    },
    {
      key: "deviating",
      icon: AlertTriangle,
      label: t.personPanelKpiDeviating,
      value: `${kpis.deviating}/${kpis.people}`,
    },
    {
      key: "closed",
      icon: CheckCircle2,
      label: t.personPanelKpiClosed,
      value: String(kpis.closedItems),
      delta: formatDelta(kpis.closedItems - kpis.closedItemsPreviousWeek),
      positive: kpis.closedItems >= kpis.closedItemsPreviousWeek,
    },
    {
      key: "progress",
      icon: TrendingUp,
      label: t.personPanelKpiProgress,
      value: kpis.averageProgress === null ? "—" : `${kpis.averageProgress}%`,
    },
    {
      key: "blockers",
      icon: ShieldAlert,
      label: t.personPanelKpiBlockers,
      value: String(kpis.blockers),
    },
    {
      key: "atRisk",
      icon: AlertTriangle,
      label: t.personPanelKpiAtRisk,
      value: `${kpis.atRisk}/${kpis.people}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ key, icon: Icon, label, value, delta, positive }) => (
        <Card key={key}>
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{label}</span>
            </div>
            <p className="font-display text-xl font-semibold">{value}</p>
            {delta !== undefined && (
              <p
                className={
                  positive ? "text-[11px] text-status-available" : "text-[11px] text-status-sick"
                }
              >
                {delta} {t.personPanelVsPrevWeek}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
