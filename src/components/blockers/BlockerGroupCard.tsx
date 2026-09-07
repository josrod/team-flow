import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRightLeft, Check, ExternalLink, UserPlus, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import type { BacklogAlert, BacklogAlertGroup, BacklogAlertKind } from "@/lib/backlogAlerts";

interface BlockerGroupCardProps {
  group: BacklogAlertGroup;
  /** Owner suggested in the app for this item, if any. */
  suggestion?: string;
  canAct: boolean;
  onSuggestOwner: (group: BacklogAlertGroup) => void;
  onMarkReviewed: (alert: BacklogAlert) => void;
}

const formatDate = (iso: string | undefined, lang: string): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES");
};

export const BlockerGroupCard = ({
  group,
  suggestion,
  canAct,
  onSuggestOwner,
  onMarkReviewed,
}: BlockerGroupCardProps) => {
  const { t, lang } = useLang();

  const alertLabels: Record<BacklogAlertKind, string> = {
    unassignedItem: t.backlogAlertUnassignedItem,
    unassignedChild: t.backlogAlertUnassignedChild,
    absentOwner: t.backlogAlertAbsentOwner,
    dependency: t.backlogAlertDependency,
  };

  const staleDays = group.alerts.reduce<number | undefined>(
    (max, alert) => (alert.staleDays !== undefined && (max === undefined || alert.staleDays > max) ? alert.staleDays : max),
    undefined,
  );

  return (
    <Card className={cn(group.severity === "high" && "border-destructive/40")}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <CardTitle className="font-display text-sm">
            <span className="font-mono text-xs text-muted-foreground">#{group.itemId}</span> {group.title}
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{group.state}</span>
            {staleDays !== undefined && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                {t.blockersStaleDays.replace("{days}", String(staleDays))}
              </Badge>
            )}
            {suggestion && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                {t.blockersSuggestionFor.replace("{name}", suggestion)}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/handovers">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {t.blockersActionHandover}
            </Link>
          </Button>
          {canAct && (
            <Button variant="outline" size="sm" onClick={() => onSuggestOwner(group)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t.blockersActionSuggest}
            </Button>
          )}
          {group.htmlUrl && (
            <Button asChild variant="ghost" size="icon" aria-label={t.backlogOpenInAdo}>
              <a href={group.htmlUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-2">
          {group.alerts.map((alert) => (
            <li
              key={alert.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 text-sm",
                alert.severity === "high" ? "border-destructive/30 bg-destructive/5" : "bg-muted/20",
              )}
            >
              <span
                className={cn("mt-0.5", alert.severity === "high" ? "text-destructive" : "text-muted-foreground")}
              >
                {alert.kind === "dependency" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <UserX className="h-4 w-4 shrink-0" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{alertLabels[alert.kind]}</p>
                <p className="text-xs text-muted-foreground">
                  {alert.parentItemId !== undefined ? `#${alert.itemId} · ${alert.title}` : ""}
                  {alert.person ? ` ${alert.person}` : ""}
                  {alert.kind === "absentOwner" && alert.detail
                    ? ` · ${t.backlogAlertUntil.replace("{date}", formatDate(alert.detail, lang) ?? alert.detail)}`
                    : alert.kind === "dependency" && alert.detail
                      ? ` · ${alert.detail}`
                      : ""}
                </p>
              </div>
              {canAct && (
                <Button variant="ghost" size="sm" onClick={() => onMarkReviewed(alert)}>
                  <Check className="mr-2 h-4 w-4" />
                  {t.blockersActionReviewed}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
