import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, StickyNote, Link2, ListChecks, Trash2, ExternalLink, Pencil, Check, X } from "lucide-react";

type NoteKind = "note" | "link" | "step";

interface HandoverNote {
  id: string;
  task_id: string;
  kind: NoteKind;
  content: string;
  url: string | null;
  done: boolean;
  author_id: string;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskHandoverNotesProps {
  taskId: string | number;
}

const contentSchema = z.string().trim().min(1, "Escribe algo").max(2000, "Máximo 2000 caracteres");
const urlSchema = z.string().trim().url("URL inválida").max(500, "URL demasiado larga");

export function TaskHandoverNotes({ taskId }: TaskHandoverNotesProps) {
  const { user } = useAuth();
  const taskIdStr = String(taskId);
  const [notes, setNotes] = useState<HandoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NoteKind>("note");
  const [draftContent, setDraftContent] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingUrl, setEditingUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("task_handover_notes")
      .select("*")
      .eq("task_id", taskIdStr)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("No se pudieron cargar las anotaciones");
        } else {
          setNotes((data ?? []) as HandoverNote[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskIdStr]);

  const resetDraft = () => {
    setDraftContent("");
    setDraftUrl("");
  };

  const handleAdd = async () => {
    if (!user) {
      toast.error("Debes iniciar sesión");
      return;
    }
    const contentResult = contentSchema.safeParse(draftContent);
    if (!contentResult.success) {
      toast.error(contentResult.error.issues[0].message);
      return;
    }
    let urlValue: string | null = null;
    if (activeTab === "link") {
      const urlResult = urlSchema.safeParse(draftUrl);
      if (!urlResult.success) {
        toast.error(urlResult.error.issues[0].message);
        return;
      }
      urlValue = urlResult.data;
    }
    setSubmitting(true);
    const authorName =
      (user.user_metadata?.display_name as string | undefined) ?? user.email ?? "Anónimo";
    const { data, error } = await supabase
      .from("task_handover_notes")
      .insert({
        task_id: taskIdStr,
        kind: activeTab,
        content: contentResult.data,
        url: urlValue,
        author_id: user.id,
        author_name: authorName,
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo guardar");
      return;
    }
    setNotes((prev) => [...prev, data as HandoverNote]);
    resetDraft();
    toast.success("Anotación añadida");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("task_handover_notes").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo borrar");
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleToggleDone = async (note: HandoverNote) => {
    const next = !note.done;
    const { error } = await supabase
      .from("task_handover_notes")
      .update({ done: next })
      .eq("id", note.id);
    if (error) {
      toast.error("No se pudo actualizar");
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, done: next } : n)));
  };

  const startEdit = (note: HandoverNote) => {
    setEditingId(note.id);
    setEditingContent(note.content);
    setEditingUrl(note.url ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
    setEditingUrl("");
  };

  const saveEdit = async (note: HandoverNote) => {
    const contentResult = contentSchema.safeParse(editingContent);
    if (!contentResult.success) {
      toast.error(contentResult.error.issues[0].message);
      return;
    }
    let urlValue: string | null = note.url;
    if (note.kind === "link") {
      const urlResult = urlSchema.safeParse(editingUrl);
      if (!urlResult.success) {
        toast.error(urlResult.error.issues[0].message);
        return;
      }
      urlValue = urlResult.data;
    }
    const { error } = await supabase
      .from("task_handover_notes")
      .update({ content: contentResult.data, url: urlValue })
      .eq("id", note.id);
    if (error) {
      toast.error("No se pudo guardar");
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, content: contentResult.data, url: urlValue } : n)),
    );
    cancelEdit();
  };

  const groups = {
    note: notes.filter((n) => n.kind === "note"),
    link: notes.filter((n) => n.kind === "link"),
    step: notes.filter((n) => n.kind === "step"),
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const renderItem = (note: HandoverNote) => {
    const isAuthor = user?.id === note.author_id;
    const isEditing = editingId === note.id;

    return (
      <li
        key={note.id}
        className="flex items-start gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
      >
        {note.kind === "step" && (
          <Checkbox
            checked={note.done}
            onCheckedChange={() => isAuthor && handleToggleDone(note)}
            disabled={!isAuthor}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                rows={2}
                maxLength={2000}
                className="text-sm"
              />
              {note.kind === "link" && (
                <Input
                  value={editingUrl}
                  onChange={(e) => setEditingUrl(e.target.value)}
                  placeholder="https://..."
                  maxLength={500}
                  className="h-8 text-xs"
                />
              )}
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7" onClick={() => saveEdit(note)}>
                  <Check className="h-3 w-3" /> Guardar
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={cancelEdit}>
                  <X className="h-3 w-3" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p
                className={
                  note.kind === "step" && note.done
                    ? "text-muted-foreground line-through"
                    : "text-foreground whitespace-pre-wrap break-words"
                }
              >
                {note.content}
              </p>
              {note.kind === "link" && note.url && (
                <a
                  href={note.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {note.url}
                </a>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {note.author_name ?? "Anónimo"} · {formatDate(note.created_at)}
              </p>
            </>
          )}
        </div>
        {isAuthor && !isEditing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => startEdit(note)}
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => handleDelete(note.id)}
              aria-label="Borrar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mt-3 rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Handover · notas, enlaces y próximos pasos
        </h4>
        <Badge variant="secondary" className="text-[10px]">
          {notes.length}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NoteKind)}>
        <TabsList className="h-8">
          <TabsTrigger value="note" className="h-7 text-xs gap-1.5">
            <StickyNote className="h-3 w-3" /> Notas ({groups.note.length})
          </TabsTrigger>
          <TabsTrigger value="link" className="h-7 text-xs gap-1.5">
            <Link2 className="h-3 w-3" /> Enlaces ({groups.link.length})
          </TabsTrigger>
          <TabsTrigger value="step" className="h-7 text-xs gap-1.5">
            <ListChecks className="h-3 w-3" /> Pasos ({groups.step.length})
          </TabsTrigger>
        </TabsList>

        {(["note", "link", "step"] as const).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-3 space-y-3">
            {loading ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
              </p>
            ) : groups[kind].length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Sin {kind === "note" ? "notas" : kind === "link" ? "enlaces" : "pasos"} todavía.
              </p>
            ) : (
              <ul className="space-y-1.5">{groups[kind].map(renderItem)}</ul>
            )}

            {user && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                {kind === "step" || kind === "note" ? (
                  <Textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    placeholder={kind === "note" ? "Contexto, decisiones, dudas…" : "Próximo paso accionable…"}
                    rows={2}
                    maxLength={2000}
                    className="text-sm"
                  />
                ) : (
                  <>
                    <Input
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder="Título del enlace"
                      maxLength={2000}
                      className="h-8 text-sm"
                    />
                    <Input
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      placeholder="https://..."
                      maxLength={500}
                      className="h-8 text-xs"
                    />
                  </>
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleAdd}
                    disabled={submitting || activeTab !== kind}
                    onMouseEnter={() => setActiveTab(kind)}
                  >
                    {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Añadir"}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
