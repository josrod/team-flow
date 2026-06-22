import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const { t } = useLang();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editable, setEditable] = useState("");
  const [coverPerson, setCoverPerson] = useState("");
  const [returnDate, setReturnDate] = useState("");

  const taskIds = useMemo(
    () => [...active, ...pending, ...blocked].map((tk) => String(tk.id)),
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
          toast.error(t.couldNotLoadNotes);
          setNotes([]);
        } else {
          setNotes((data ?? []) as NoteRow[]);
        }
        setLoading(false);
      });
  }, [open, taskIds, t]);

  const summary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# ${t.handoverOfHeading.replace("{name}", person)}`);
    lines.push(t.generatedOn.replace("{date}", formatDate(new Date())));
    if (coverPerson.trim()) lines.push(t.coverLine.replace("{name}", coverPerson.trim()));
    if (returnDate.trim()) lines.push(t.returnLine.replace("{date}", returnDate.trim()));
    lines.push("");

    const notesByTask = new Map<string, NoteRow[]>();
    notes.forEach((n) => {
      if (!notesByTask.has(n.task_id)) notesByTask.set(n.task_id, []);
      notesByTask.get(n.task_id)!.push(n);
    });

    const renderTaskBlock = (label: string, tasks: SummaryTask[]) => {
      if (tasks.length === 0) return;
      lines.push(`## ${label} (${tasks.length})`);
      tasks.forEach((tk) => {
        const link = tfsBaseUrl ? ` — ${tfsBaseUrl}/_workitems/edit/${tk.id}` : "";
        lines.push(`- [#${tk.id}] ${tk.title} (${tk.type} · ${tk.state})${link}`);
        const taskNotes = notesByTask.get(String(tk.id)) ?? [];
        const tNotes = taskNotes.filter((n) => n.kind === "note");
        const tLinks = taskNotes.filter((n) => n.kind === "link");
        const tSteps = taskNotes.filter((n) => n.kind === "step");
        tNotes.forEach((n) => lines.push(`    · ${t.noteByAuthor.replace("{author}", n.author_name ?? "?")}: ${n.content}`));
        tLinks.forEach((n) => lines.push(`    · ${t.linkWord}: ${n.content}${n.url ? ` → ${n.url}` : ""}`));
        tSteps.forEach((n) =>
          lines.push(`    · ${t.stepWord} ${n.done ? "[x]" : "[ ]"}: ${n.content}`),
        );
      });
      lines.push("");
    };

    renderTaskBlock(t.inProgressHeading, active);
    renderTaskBlock(t.pendingHeading, pending);
    renderTaskBlock(t.blockedHeading, blocked);

    if (active.length + pending.length + blocked.length === 0) {
      lines.push(t.noOpenTasksItalic);
    }

    return lines.join("\n");
  }, [person, active, pending, blocked, notes, tfsBaseUrl, coverPerson, returnDate, t]);

  // Reset editable text whenever the generated summary changes (e.g. after notes load)
  useEffect(() => {
    setEditable(summary);
  }, [summary]);

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
            <FileText className="h-5 w-5" /> {t.handoverSummaryTitle.replace("{name}", person)}
          </DialogTitle>
          <DialogDescription>
            {t.handoverSummaryDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="cover-person">
              {t.coverPersonLabel}
            </label>
            <input
              id="cover-person"
              value={coverPerson}
              onChange={(e) => setCoverPerson(e.target.value)}
              placeholder={t.coverPersonPlaceholder}
              maxLength={120}
              className="w-full h-9 rounded-md border border-border/60 bg-background px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="return-date">
              {t.expectedReturnLabel}
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
          <Badge variant="secondary">{t.inProgressHeading} · {active.length}</Badge>
          <Badge variant="secondary">{t.pendingHeading} · {pending.length}</Badge>
          <Badge variant="secondary">{t.blockedHeading} · {blocked.length}</Badge>
          <Badge variant="outline">{t.annotationsCount.replace("{count}", String(notes.length))}</Badge>
          {loading && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t.loadingNotes}
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
            {t.closeAction}
          </Button>
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
