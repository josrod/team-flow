import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRight, CalendarDays, Pencil, Trash2, Briefcase } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import type { Handover, Absence, TeamMember, WorkTopic } from "@/types";

interface HandoverCardProps {
  handover: Handover;
  fromMember: TeamMember | undefined;
  toMember: TeamMember | undefined;
  absence: Absence | undefined;
  topics: WorkTopic[];
  onEdit: (h: Handover) => void;
  onDelete: (id: string) => void;
}

export function HandoverCard({
  handover,
  fromMember,
  toMember,
  absence,
  topics,
  onEdit,
  onDelete,
}: HandoverCardProps) {
  const { t } = useLang();

  const absenceDays =
    absence
      ? differenceInCalendarDays(parseISO(absence.endDate), parseISO(absence.startDate)) + 1
      : null;

  const absenceTypeLabel =
    absence?.type === "vacation" ? t.vacation : absence?.type === "sick-leave" ? t.sickLeave : "";

  const absenceTypeClass =
    absence?.type === "vacation"
      ? "bg-[hsl(var(--status-vacation)/.12)] text-[hsl(var(--status-vacation))]"
      : "bg-[hsl(var(--status-sick)/.12)] text-[hsl(var(--status-sick))]";

  return (
    <Card className="hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Colored top accent based on absence type */}
      <div
        className={cn(
          "h-1",
          absence?.type === "vacation"
            ? "bg-[hsl(var(--status-vacation))]"
            : "bg-[hsl(var(--status-sick))]"
        )}
      />
      <CardContent className="p-4 space-y-3">
        {/* Header: people + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-[10px] bg-[hsl(var(--status-sick)/.1)] text-[hsl(var(--status-sick))] font-semibold">
                {fromMember?.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{fromMember?.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{fromMember?.role}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mx-1" />
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-[10px] bg-[hsl(var(--status-available)/.1)] text-[hsl(var(--status-available))] font-semibold">
                {toMember?.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{toMember?.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{toMember?.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => onEdit(handover)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.deleteHandoverTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{t.deleteHandoverDesc}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(handover.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t.confirmDelete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Absence info row */}
        {absence && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                absenceTypeClass
              )}
            >
              {absenceTypeLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {format(parseISO(absence.startDate), "dd/MM/yyyy")} –{" "}
              {format(parseISO(absence.endDate), "dd/MM/yyyy")}
            </span>
            {absenceDays !== null && (
              <span className="text-[11px] font-medium text-muted-foreground">
                ({absenceDays} {t.days})
              </span>
            )}
          </div>
        )}

        {/* Topics */}
        {topics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
            {topics.map((tp) => (
              <span
                key={tp.id}
                className="text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium"
              >
                {tp.name}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {handover.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {handover.notes}
          </p>
        )}

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          {t.created}: {handover.createdAt}
        </p>
      </CardContent>
    </Card>
  );
}
