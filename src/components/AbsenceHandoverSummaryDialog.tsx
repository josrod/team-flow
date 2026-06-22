import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Download, FileText } from "lucide-react";
import type { Absence } from "@/types";
import { format, parseISO } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  absence: Absence | null;
}

const fmtDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

export function AbsenceHandoverSummaryDialog({ open, onOpenChange, absence }: Props) {
  const { members, workTopics, handovers, teams } = useApp();
  const { t } = useLang();
  const [editable, setEditable] = useState("");

  const data = useMemo(() => {
    if (!absence) return null;
    const person = members.find((m) => m.id === absence.memberId);
    const team = teams.find((tm) => tm.id === person?.teamId);
    const personTopics = workTopics.filter((w) => w.memberId === absence.memberId);
    const inProgress = personTopics.filter((w) => w.status === "in-progress");
    const pending = personTopics.filter((w) => w.status === "pending");
    const blocked = personTopics.filter((w) => w.status === "blocked");

    const linkedHandovers = handovers.filter((h) => h.absenceId === absence.id);
    const topicCovers = new Map<string, string>(); // topicId -> coverMemberName
    linkedHandovers.forEach((h) => {
      const cover = members.find((m) => m.id === h.toMemberId)?.name ?? "?";
      h.topicIds.forEach((tid) => topicCovers.set(tid, cover));
    });

    return { person, team, inProgress, pending, blocked, linkedHandovers, topicCovers };
  }, [absence, members, workTopics, handovers, teams]);

  const summary = useMemo(() => {
    if (!absence || !data) return "";
    const { person, team, inProgress, pending, blocked, linkedHandovers, topicCovers } = data;

    const absenceLabels: Record<string, string> = {
      vacation: t.statusVacation,
      "sick-leave": t.absSickLeaveLabel,
      "work-travel": t.statusWorkTravel,
      "other-project": t.statusOtherProject,
      "parental-leave": t.statusParentalLeave,
    };

    const lines: string[] = [];
    lines.push(`# ${t.handoverOfHeading.replace("{name}", person?.name ?? "?")}`);
    lines.push(t.generatedOn.replace("{date}", format(new Date(), "dd/MM/yyyy")));
    if (team) lines.push(t.teamInline.replace("{name}", team.name));
    if (person?.role) lines.push(t.roleInline.replace("{role}", person.role));
    lines.push(
      t.absenceInline
        .replace("{type}", absenceLabels[absence.type] ?? absence.type)
        .replace("{start}", fmtDate(absence.startDate))
        .replace("{end}", fmtDate(absence.endDate)),
    );
    lines.push("");

    const renderBlock = (label: string, items: typeof inProgress) => {
      if (items.length === 0) return;
      lines.push(`## ${label} (${items.length})`);
      items.forEach((tp) => {
        const cover = topicCovers.get(tp.id);
        const reassigned = tp.reassignedFrom
          ? members.find((m) => m.id === tp.reassignedFrom)?.name
          : null;
        const coverPart = cover
          ? ` — ${t.coverInline.replace("{name}", cover)}`
          : ` — ${t.noResponsibleInline}`;
        lines.push(`- ${tp.name}${coverPart}`);
        if (tp.description) lines.push(`    · ${tp.description}`);
        if (reassigned) lines.push(`    · ${t.reassignedFromInline.replace("{name}", reassigned)}`);
      });
      lines.push("");
    };

    renderBlock(t.inProgressHeading, inProgress);
    renderBlock(t.pendingHeading, pending);
    renderBlock(t.blockedHeading, blocked);

    if (linkedHandovers.length > 0) {
      lines.push(`## ${t.registeredHandoversTitle.replace("{count}", String(linkedHandovers.length))}`);
      linkedHandovers.forEach((h) => {
        const to = members.find((m) => m.id === h.toMemberId)?.name ?? "?";
        const topicNames = h.topicIds
          .map((tid) => workTopics.find((w) => w.id === tid)?.name)
          .filter(Boolean)
          .join(", ");
        lines.push(`- → ${to}${topicNames ? ` · ${topicNames}` : ""}`);
        if (h.notes) lines.push(`    · ${t.notesInline.replace("{text}", h.notes)}`);
      });
      lines.push("");
    } else {
      lines.push(t.noHandoversWarning);
      lines.push("");
    }

    if (inProgress.length + pending.length + blocked.length === 0) {
      lines.push(t.noTopicsItalic);
    }

    return lines.join("\n");
  }, [absence, data, members, workTopics, t]);

  useEffect(() => {
    setEditable(summary);
  }, [summary]);

  if (!absence || !data) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editable);
      toast.success(t.summaryCopied);
    } catch {
      toast.error(t.couldNotCopy);
    }
  };

  const handleDownload = () => {
    const blob = new Blob(["\uFEFF" + editable], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (data.person?.name ?? "handover").replace(/[^a-zA-Z0-9-_]+/g, "_");
    a.download = `handover_${safe}_${absence.startDate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const total = data.inProgress.length + data.pending.length + data.blocked.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {t.handoverSummaryTitle.replace("{name}", data.person?.name ?? "")}
          </DialogTitle>
          <DialogDescription>
            {t.handoverSummaryAbsenceDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="secondary">{t.inProgressHeading} · {data.inProgress.length}</Badge>
          <Badge variant="secondary">{t.pendingHeading} · {data.pending.length}</Badge>
          <Badge variant="secondary">{t.blockedHeading} · {data.blocked.length}</Badge>
          <Badge variant="outline">{data.linkedHandovers.length} {t.handoversWord}</Badge>
          <Badge variant="outline">{total} {t.topicsWord}</Badge>
        </div>

        <Textarea
          value={editable}
          onChange={(e) => setEditable(e.target.value)}
          className="flex-1 min-h-[320px] font-mono text-xs"
          spellCheck={false}
        />

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t.closeAction}</Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4" /> {t.downloadMd}
          </Button>
          <Button onClick={handleCopy}>
            <Copy className="h-4 w-4" /> {t.copyAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
