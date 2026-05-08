import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
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
import type { Absence, WorkTopicStatus } from "@/types";
import { format, parseISO } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  absence: Absence | null;
}

const STATUS_LABEL: Record<WorkTopicStatus, string> = {
  "in-progress": "En progreso",
  pending: "Pendiente",
  blocked: "Bloqueada",
  completed: "Completada",
};

const ABSENCE_LABEL: Record<string, string> = {
  vacation: "Vacaciones",
  "sick-leave": "Baja médica",
  "work-travel": "Viaje de trabajo",
  "other-project": "Otro proyecto",
  "parental-leave": "Baja parental",
};

const fmtDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");

export function AbsenceHandoverSummaryDialog({ open, onOpenChange, absence }: Props) {
  const { members, workTopics, handovers, teams } = useApp();
  const [editable, setEditable] = useState("");

  const data = useMemo(() => {
    if (!absence) return null;
    const person = members.find((m) => m.id === absence.memberId);
    const team = teams.find((t) => t.id === person?.teamId);
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
    const lines: string[] = [];
    lines.push(`# Handover de ${person?.name ?? "?"}`);
    lines.push(`Generado el ${format(new Date(), "dd/MM/yyyy")}`);
    if (team) lines.push(`Equipo: ${team.name}`);
    if (person?.role) lines.push(`Rol: ${person.role}`);
    lines.push(
      `Ausencia: ${ABSENCE_LABEL[absence.type] ?? absence.type} · ${fmtDate(absence.startDate)} → ${fmtDate(absence.endDate)}`,
    );
    lines.push("");

    const renderBlock = (label: string, items: typeof inProgress) => {
      if (items.length === 0) return;
      lines.push(`## ${label} (${items.length})`);
      items.forEach((t) => {
        const cover = topicCovers.get(t.id);
        const reassigned = t.reassignedFrom
          ? members.find((m) => m.id === t.reassignedFrom)?.name
          : null;
        lines.push(`- ${t.name}${cover ? ` — Cubre: ${cover}` : " — Sin responsable asignado"}`);
        if (t.description) lines.push(`    · ${t.description}`);
        if (reassigned) lines.push(`    · Reasignada de: ${reassigned}`);
      });
      lines.push("");
    };

    renderBlock("En progreso", inProgress);
    renderBlock("Pendientes", pending);
    renderBlock("Bloqueadas", blocked);

    if (linkedHandovers.length > 0) {
      lines.push(`## Handovers registrados (${linkedHandovers.length})`);
      linkedHandovers.forEach((h) => {
        const to = members.find((m) => m.id === h.toMemberId)?.name ?? "?";
        const topicNames = h.topicIds
          .map((tid) => workTopics.find((w) => w.id === tid)?.name)
          .filter(Boolean)
          .join(", ");
        lines.push(`- → ${to}${topicNames ? ` · ${topicNames}` : ""}`);
        if (h.notes) lines.push(`    · Notas: ${h.notes}`);
      });
      lines.push("");
    } else {
      lines.push(`> ⚠️ No hay handovers registrados para esta ausencia.`);
      lines.push("");
    }

    if (inProgress.length + pending.length + blocked.length === 0) {
      lines.push("_Sin temas en progreso, pendientes ni bloqueados._");
    }

    return lines.join("\n");
  }, [absence, data, members, workTopics]);

  useEffect(() => {
    setEditable(summary);
  }, [summary]);

  if (!absence || !data) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editable);
      toast.success("Resumen copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
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
            <FileText className="h-5 w-5" /> Resumen de handover · {data.person?.name}
          </DialogTitle>
          <DialogDescription>
            Recopila temas en progreso, pendientes y bloqueados junto con los responsables que
            cubren a la persona durante su ausencia. Edita libremente antes de copiar o descargar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="secondary">{STATUS_LABEL["in-progress"]} · {data.inProgress.length}</Badge>
          <Badge variant="secondary">{STATUS_LABEL.pending} · {data.pending.length}</Badge>
          <Badge variant="secondary">{STATUS_LABEL.blocked} · {data.blocked.length}</Badge>
          <Badge variant="outline">{data.linkedHandovers.length} handovers</Badge>
          <Badge variant="outline">{total} temas</Badge>
        </div>

        <Textarea
          value={editable}
          onChange={(e) => setEditable(e.target.value)}
          className="flex-1 min-h-[320px] font-mono text-xs"
          spellCheck={false}
        />

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4" /> Descargar .md
          </Button>
          <Button onClick={handleCopy}>
            <Copy className="h-4 w-4" /> Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
