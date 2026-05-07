import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Copy, Download, FileText, Loader2 } from "lucide-react";

interface SummaryTask {
  id: string | number;
  title: string;
  state: string;
  type: string;
}

interface HandoverSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: string;
  active: SummaryTask[];
  pending: SummaryTask[];
  blocked: SummaryTask[];
  tfsBaseUrl: string | null;
}

interface NoteRow {
  task_id: string;
  kind: "note" | "link" | "step";
  content: string;
  url: string | null;
  done: boolean;
  author_name: string | null;
}

const formatDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

export function HandoverSummaryDialog({
  open,
  onOpenChange,
  person,
  active,
  pending,
  blocked,
  tfsBaseUrl,
}: HandoverSummaryDialogProps) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editable, setEditable] = useState("");
  const [coverPerson, setCoverPerson] = useState("");
  const [returnDate, setReturnDate] = useState("");

  const taskIds = useMemo(
    () => [...active, ...pending, ...blocked].map((t) => String(t.id)),
    [active, pending, blocked],
  );

  useEffect(() => {
    if (!open || taskIds.length === 0) {
      setNotes([]);
      return;
    }
    setLoading(true);
    supabase
      .from("task_handover_notes")
      .select("task_id, kind, content, url, done, author_name")
      .in("task_id", taskIds)
      .then(({ data, error }) => {
        if (error) {
          toast.error("No se pudieron cargar las anotaciones");
          setNotes([]);
        } else {
          setNotes((data ?? []) as NoteRow[]);
        }
        setLoading(false);
      });
  }, [open, taskIds]);

  const summary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# Handover de ${person}`);
    lines.push(`Generado el ${formatDate(new Date())}`);
    if (coverPerson.trim()) lines.push(`Cubre: ${coverPerson.trim()}`);
    if (returnDate.trim()) lines.push(`Vuelta prevista: ${returnDate.trim()}`);
    lines.push("");

    const notesByTask = new Map<string, NoteRow[]>();
    notes.forEach((n) => {
      if (!notesByTask.has(n.task_id)) notesByTask.set(n.task_id, []);
      notesByTask.get(n.task_id)!.push(n);
    });

    const renderTaskBlock = (label: string, tasks: SummaryTask[]) => {
      if (tasks.length === 0) return;
      lines.push(`## ${label} (${tasks.length})`);
      tasks.forEach((t) => {
        const link = tfsBaseUrl ? ` — ${tfsBaseUrl}/_workitems/edit/${t.id}` : "";
        lines.push(`- [#${t.id}] ${t.title} (${t.type} · ${t.state})${link}`);
        const taskNotes = notesByTask.get(String(t.id)) ?? [];
        const tNotes = taskNotes.filter((n) => n.kind === "note");
        const tLinks = taskNotes.filter((n) => n.kind === "link");
        const tSteps = taskNotes.filter((n) => n.kind === "step");
        tNotes.forEach((n) => lines.push(`    · Nota (${n.author_name ?? "?"}): ${n.content}`));
        tLinks.forEach((n) => lines.push(`    · Enlace: ${n.content}${n.url ? ` → ${n.url}` : ""}`));
        tSteps.forEach((n) =>
          lines.push(`    · Paso ${n.done ? "[x]" : "[ ]"}: ${n.content}`),
        );
      });
      lines.push("");
    };

    renderTaskBlock("En progreso", active);
    renderTaskBlock("Pendientes", pending);
    renderTaskBlock("Bloqueadas", blocked);

    if (active.length + pending.length + blocked.length === 0) {
      lines.push("_Sin tareas abiertas, en progreso ni bloqueadas._");
    }

    return lines.join("\n");
  }, [person, active, pending, blocked, notes, tfsBaseUrl, coverPerson, returnDate]);

  // Reset editable text whenever the generated summary changes (e.g. after notes load)
  useEffect(() => {
    setEditable(summary);
  }, [summary]);

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
    const safe = person.replace(/[^a-zA-Z0-9-_]+/g, "_");
    a.download = `handover_${safe}_${formatDate(new Date()).replace(/\//g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Resumen de handover · {person}
          </DialogTitle>
          <DialogDescription>
            Recopila tareas en progreso, pendientes y bloqueadas junto con notas, enlaces y pasos
            registrados. Edita libremente antes de copiar o descargar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="cover-person">
              Persona que cubre
            </label>
            <input
              id="cover-person"
              value={coverPerson}
              onChange={(e) => setCoverPerson(e.target.value)}
              placeholder="Nombre del / de la responsable temporal"
              maxLength={120}
              className="w-full h-9 rounded-md border border-border/60 bg-background px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="return-date">
              Vuelta prevista
            </label>
            <input
              id="return-date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              placeholder="DD/MM/YYYY"
              maxLength={40}
              className="w-full h-9 rounded-md border border-border/60 bg-background px-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="secondary">En progreso · {active.length}</Badge>
          <Badge variant="secondary">Pendientes · {pending.length}</Badge>
          <Badge variant="secondary">Bloqueadas · {blocked.length}</Badge>
          <Badge variant="outline">{notes.length} anotaciones</Badge>
          {loading && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando notas…
            </span>
          )}
        </div>

        <Textarea
          value={editable}
          onChange={(e) => setEditable(e.target.value)}
          className="flex-1 min-h-[320px] font-mono text-xs"
          spellCheck={false}
        />

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
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
