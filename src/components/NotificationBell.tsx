import { useMemo, useState } from "react";
import { Bell, AlertTriangle, Users, ShieldAlert } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "no-handover" | "coverage-gap" | "upcoming-no-handover";
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  severity: "warning" | "error" | "info";
}

export function NotificationBell() {
  const { absences, handovers, members, teams, workTopics } = useApp();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const notifications = useMemo<Notification[]>(() => {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const alerts: Notification[] = [];

    // Active absences without a handover
    const activeAbsences = absences.filter(
      (a) => a.startDate <= today && a.endDate >= today
    );
    for (const absence of activeAbsences) {
      const hasHandover = handovers.some((h) => h.absenceId === absence.id);
      if (!hasHandover) {
        const member = members.find((m) => m.id === absence.memberId);
        if (member) {
          alerts.push({
            id: `no-ho-${absence.id}`,
            type: "no-handover",
            icon: AlertTriangle,
            title: t.notifNoHandover,
            description: t.notifNoHandoverDesc.replace("{name}", member.name),
            severity: "error",
          });
        }
      }
    }

    // Upcoming absences (next 7 days) without handover
    const upcomingAbsences = absences.filter(
      (a) => a.startDate > today && a.startDate <= sevenDaysLater
    );
    for (const absence of upcomingAbsences) {
      const hasHandover = handovers.some((h) => h.absenceId === absence.id);
      if (!hasHandover) {
        const member = members.find((m) => m.id === absence.memberId);
        if (member) {
          alerts.push({
            id: `upcoming-${absence.id}`,
            type: "upcoming-no-handover",
            icon: ShieldAlert,
            title: t.notifUpcomingNoHandover,
            description: t.notifUpcomingNoHandoverDesc
              .replace("{name}", member.name)
              .replace("{date}", new Date(absence.startDate).toLocaleDateString("es-ES")),
            severity: "warning",
          });
        }
      }
    }

    // Coverage gaps: teams where >50% members are absent
    const teamMap = new Map<string, { total: number; absent: number }>();
    for (const member of members) {
      const entry = teamMap.get(member.teamId) ?? { total: 0, absent: 0 };
      entry.total++;
      const isAbsent = activeAbsences.some((a) => a.memberId === member.id);
      if (isAbsent) entry.absent++;
      teamMap.set(member.teamId, entry);
    }
    for (const [teamId, { total, absent }] of teamMap) {
      if (total > 1 && absent / total > 0.5) {
        const team = teams.find((t) => t.id === teamId);
        if (team) {
          alerts.push({
            id: `gap-${teamId}`,
            type: "coverage-gap",
            icon: Users,
            title: t.notifCoverageGap,
            description: t.notifCoverageGapDesc
              .replace("{team}", team.name)
              .replace("{absent}", String(absent))
              .replace("{total}", String(total)),
            severity: "error",
          });
        }
      }
    }

    // Members with active topics but absent and no handover covering those topics
    for (const absence of activeAbsences) {
      const memberTopics = workTopics.filter(
        (wt) => wt.memberId === absence.memberId && wt.status !== "completed"
      );
      if (memberTopics.length === 0) continue;
      const coveredTopicIds = handovers
        .filter((h) => h.absenceId === absence.id)
        .flatMap((h) => h.topicIds);
      const uncovered = memberTopics.filter((wt) => !coveredTopicIds.includes(wt.id));
      if (uncovered.length > 0) {
        const member = members.find((m) => m.id === absence.memberId);
        if (member) {
          // Avoid duplicate with no-handover alert
          const alreadyHasNoHandover = alerts.some((a) => a.id === `no-ho-${absence.id}`);
          if (!alreadyHasNoHandover) {
            alerts.push({
              id: `uncovered-${absence.id}`,
              type: "coverage-gap",
              icon: ShieldAlert,
              title: t.notifUncoveredTopics,
              description: t.notifUncoveredTopicsDesc
                .replace("{count}", String(uncovered.length))
                .replace("{name}", member.name),
              severity: "warning",
            });
          }
        }
      }
    }

    return alerts;
  }, [absences, handovers, members, teams, workTopics, t]);

  const errorCount = notifications.filter((n) => n.severity === "error").length;
  const warningCount = notifications.filter((n) => n.severity === "warning").length;
  const totalCount = notifications.length;

  const severityStyles: Record<string, string> = {
    error: "bg-destructive/10 border-destructive/30 text-destructive",
    warning: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
    info: "bg-primary/10 border-primary/30 text-primary",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {totalCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                errorCount > 0 ? "bg-destructive" : "bg-orange-500"
              )}
            >
              {totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">{t.notifTitle}</h4>
          {totalCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {errorCount > 0 && `${errorCount} ${t.notifCritical}`}
              {errorCount > 0 && warningCount > 0 && " · "}
              {warningCount > 0 && `${warningCount} ${t.notifWarnings}`}
            </p>
          )}
        </div>
        <ScrollArea className="max-h-72">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t.notifEmpty}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 rounded-md border p-3 text-sm transition-colors",
                    severityStyles[n.severity]
                  )}
                >
                  <n.icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-xs leading-tight">{n.title}</p>
                    <p className="text-xs opacity-80 mt-0.5 leading-snug">{n.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
