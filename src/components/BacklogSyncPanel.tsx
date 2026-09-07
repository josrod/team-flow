import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, KanbanSquare, RefreshCw, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { useBacklogSync } from "@/hooks/use-backlog-sync";
import { buildBacklogAlerts, type BacklogAlert, type BacklogAlertKind } from "@/lib/backlogAlerts";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";
import { filterInternalMembers, filterInternalTeams } from "@/lib/internalTeams";

const VISIBLE_ALERTS = 6;

const formatDate = (iso: string | undefined, lang: string): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES");
};

export const BacklogSyncPanel = () => {
  const { t, lang } = useLang();
  const { teams, members, absences } = useApp();
  const { cards, loading, error, lastSyncedAt, reload } = useBacklogSync();
  const [expanded, setExpanded] = useState(false);

  const internalMembers = useMemo(
    () => filterInternalMembers(members, filterInternalTeams(teams)),
    [members, teams],
  );
  const assigneeIndex = useMemo(() => buildAssigneeIndex(internalMembers), [internalMembers]);

  const alerts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return buildBacklogAlerts(cards, {
      absenceFor: (person) => {
        const member = resolveMember(person, undefined, assigneeIndex);
        if (!member) return undefined;
        const active = absences.find(
          (absence) =>
            absence.memberId === member.id && absence.startDate <= today && absence.endDate >= today,
        );
        return active ? { type: active.type, until: active.endDate } : undefined;
      },
    });
  }, [cards, assigneeIndex, absences]);

  const stats = useMemo(() => {
    const active = cards.filter((card) => card.column !== "closed");
    const inProgress = active.filter((card) => card.column === "inProgress").length;
    const childTasks = active.reduce(
      (total, card) => total + card.children.filter((child) => child.column !== "closed").length,
      0,
    );
    const childDone = cards.reduce((total, card) => total + card.childrenDone, 0);
    return { active: active.length, inProgress, childTasks, childDone };
  }, [cards]);

  const alertLabels: Record<BacklogAlertKind, string> = {
    unassignedItem: t.backlogAlertUnassignedItem,
    unassignedChild: t.backlogAlertUnassignedChild,
    absentOwner: t.backlogAlertAbsentOwner,
    dependency: t.backlogAlertDependency,
  };

  const alertIcon = (alert: BacklogAlert) =>
    alert.kind === "absentOwner" || alert.kind === "unassignedItem" || alert.kind === "unassignedChild" ? (
      <UserX className="h-4 w-4 shrink-0" />
    ) : (
      <AlertTriangle className="h-4 w-4 shrink-0" />
    );

  const shown = expanded ? alerts : alerts.slice(0, VISIBLE_ALERTS);

  const syncLabel = loading
    ? t.backlogSyncSyncing
    : lastSyncedAt
      ? t.backlogSyncedAt.replace(
          "{time}",
          lastSyncedAt.toLocaleTimeString(lang === "en" ? "en-GB" : "es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      : t.backlogSyncNever;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="font-display text-base">{t.backlogSyncTitle}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t.backlogSyncSubtitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{syncLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reload({ forceRefresh: true })} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t.backlogSyncNow}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/features">
              <KanbanSquare className="mr-2 h-4 w-4" />
              {t.backlogSyncOpenBoard}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading && cards.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: t.backlogSyncActiveItems, value: stats.active },
              { label: t.backlogSyncInProgress, value: stats.inProgress },
              { label: t.backlogSyncChildTasks, value: stats.childTasks },
              { label: t.backlogSyncDone, value: stats.childDone },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-muted/40 p-3">
                <p className="font-display text-xl font-semibold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t.backlogAlertsTitle}
            </h3>
            {alerts.length > 0 && <Badge variant="secondary">{alerts.length}</Badge>}
          </div>

          {alerts.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.backlogAlertsNone}</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((alert) => (
                <li
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-3 text-sm",
                    alert.severity === "high" ? "border-destructive/40 bg-destructive/5" : "bg-muted/20",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5",
                      alert.severity === "high" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {alertIcon(alert)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      #{alert.itemId} · {alert.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alertLabels[alert.kind]}
                      {alert.person ? ` · ${alert.person}` : ""}
                      {alert.kind === "absentOwner" && alert.detail
                        ? ` · ${t.backlogAlertUntil.replace("{date}", formatDate(alert.detail, lang) ?? alert.detail)}`
                        : alert.detail && alert.kind !== "absentOwner"
                          ? ` · ${alert.detail}`
                          : ""}
                    </p>
                  </div>
                  {alert.htmlUrl && (
                    <a
                      href={alert.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t.backlogOpenInAdo}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {alerts.length > VISIBLE_ALERTS && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded
                ? t.backlogAlertsShowLess
                : t.backlogAlertsShowAll.replace("{count}", String(alerts.length))}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
