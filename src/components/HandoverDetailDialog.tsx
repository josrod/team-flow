import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  CalendarDays,
  Briefcase,
  FileText,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLang } from "@/context/LanguageContext";
import type { Handover, Absence, TeamMember, WorkTopic } from "@/types";

interface HandoverDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handover: Handover | null;
  fromMember: TeamMember | undefined;
  toMember: TeamMember | undefined;
  absence: Absence | undefined;
  topics: WorkTopic[];
  onEdit?: (h: Handover) => void;
  onDelete?: (id: string) => void;
}

export function HandoverDetailDialog({
  open,
  onOpenChange,
  handover,
  fromMember,
  toMember,
  absence,
  topics,
  onEdit,
  onDelete,
}: HandoverDetailDialogProps) {
  const { t } = useLang();

  if (!handover) return null;

  const absenceDays = absence
    ? differenceInCalendarDays(parseISO(absence.endDate), parseISO(absence.startDate)) + 1
    : null;

  const absenceTypeLabel =
    absence?.type === "vacation" ? t.vacation : absence?.type === "sick-leave" ? t.sickLeave : "";

  const statusColorClass =
    absence?.type === "vacation"
      ? "bg-[hsl(var(--status-vacation)/.12)] text-[hsl(var(--status-vacation))]"
      : "bg-[hsl(var(--status-sick)/.12)] text-[hsl(var(--status-sick))]";

  const accentColor =
    absence?.type === "vacation"
      ? "bg-[hsl(var(--status-vacation))]"
      : "bg-[hsl(var(--status-sick))]";

  const topicStatusLabel = (status: string) => {
    switch (status) {
      case "in-progress": return t.inProgress;
      case "pending": return t.pending;
      case "blocked": return t.blocked;
      case "completed": return t.completed;
      default: return status;
    }
  };

  const topicStatusClass = (status: string) => {
    switch (status) {
      case "in-progress": return "bg-[hsl(var(--status-vacation)/.12)] text-[hsl(var(--status-vacation))]";
      case "pending": return "bg-muted text-muted-foreground";
      case "blocked": return "bg-[hsl(var(--status-sick)/.12)] text-[hsl(var(--status-sick))]";
      case "completed": return "bg-[hsl(var(--status-available)/.12)] text-[hsl(var(--status-available))]";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        {/* Accent bar */}
        <div className={cn("h-1.5", accentColor)} />

        <div className="p-6 space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t.handoverDetail}</DialogTitle>
          </DialogHeader>

          {/* People section */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="text-xs bg-[hsl(var(--status-sick)/.1)] text-[hsl(var(--status-sick))] font-semibold">
                  {fromMember?.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{fromMember?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{fromMember?.role}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="text-xs bg-[hsl(var(--status-available)/.1)] text-[hsl(var(--status-available))] font-semibold">
                  {toMember?.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{toMember?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{toMember?.role}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Absence details */}
          {absence && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <CalendarDays className="h-3.5 w-3.5" />
                {t.absencePeriod}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", statusColorClass)}>
                  {absenceTypeLabel}
                </span>
                <span className="text-sm text-foreground">
                  {format(parseISO(absence.startDate), "dd/MM/yyyy")} – {format(parseISO(absence.endDate), "dd/MM/yyyy")}
                </span>
                {absenceDays !== null && (
                  <Badge variant="secondary" className="text-xs">
                    {absenceDays} {t.days}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Topics with full details */}
          {topics.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5" />
                {t.topicsToTransfer} ({topics.length})
              </div>
              <div className="space-y-2">
                {topics.map((tp) => (
                  <div
                    key={tp.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{tp.name}</p>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", topicStatusClass(tp.status))}>
                        {topicStatusLabel(tp.status)}
                      </span>
                    </div>
                    {tp.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{tp.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes - full text */}
          {handover.notes && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5" />
                {t.notes}
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {handover.notes}
              </p>
            </div>
          )}

          {/* Footer with actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {t.created}: {handover.createdAt}
            </div>
            {(onEdit || onDelete) && (
              <div className="flex items-center gap-2">
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit(handover);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t.editHandover}
                  </Button>
                )}
                {onDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t.confirmDelete}
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
                          onClick={() => {
                            onOpenChange(false);
                            onDelete(handover.id);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t.confirmDelete}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
