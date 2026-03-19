import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, CalendarIcon, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { handoverNotesSchema } from "@/lib/validation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Handover } from "@/types";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function HandoversPage() {
  const { teams, members, absences, workTopics, handovers, addHandover, updateHandover, deleteHandover } = useApp();
  const { t } = useLang();
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingHandover, setEditingHandover] = useState<Handover | null>(null);
  const [fromMember, setFromMember] = useState("");
  const [toMember, setToMember] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const today = new Date().toISOString().split("T")[0];

  const filteredMemberIds = useMemo(() => {
    if (selectedTeam === "all") return members.map((m) => m.id);
    return members.filter((m) => m.teamId === selectedTeam).map((m) => m.id);
  }, [members, selectedTeam]);

  const filteredHandovers = useMemo(() => {
    return handovers.filter((h) => {
      if (!filteredMemberIds.includes(h.fromMemberId)) return false;
      if (dateFrom && h.createdAt < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && h.createdAt > format(dateTo, "yyyy-MM-dd")) return false;
      return true;
    });
  }, [handovers, filteredMemberIds, dateFrom, dateTo]);

  const membersWithAbsence = members.filter((m) =>
    absences.some((a) => a.memberId === m.id && a.endDate >= today)
  );

  const fromMemberAbsence = absences.find(
    (a) => a.memberId === fromMember && a.endDate >= today
  );

  const fromMemberTopics = workTopics.filter((tp) => tp.memberId === fromMember);

  const resetForm = () => {
    setFromMember("");
    setToMember("");
    setSelectedTopics([]);
    setNotes("");
    setEditingHandover(null);
  };

  const handleAdd = () => {
    if (!fromMember) { toast.error(t.handoverSelectAbsent); return; }
    if (!toMember) { toast.error(t.handoverSelectCover); return; }
    if (!fromMemberAbsence) { toast.error(t.handoverSelectAbsent); return; }
    if (selectedTopics.length === 0) { toast.error(t.handoverSelectTopics); return; }
    const notesResult = handoverNotesSchema.safeParse(notes);
    if (!notesResult.success) {
      toast.error(notesResult.error.errors[0].message);
      return;
    }
    addHandover({
      fromMemberId: fromMember,
      toMemberId: toMember,
      absenceId: fromMemberAbsence.id,
      topicIds: selectedTopics,
      notes: notesResult.data,
    });
    setAddOpen(false);
    resetForm();
  };

  const openEdit = (h: Handover) => {
    setEditingHandover(h);
    setFromMember(h.fromMemberId);
    setToMember(h.toMemberId);
    setSelectedTopics([...h.topicIds]);
    setNotes(h.notes);
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingHandover) return;
    if (!toMember) { toast.error(t.handoverSelectCover); return; }
    if (selectedTopics.length === 0) { toast.error(t.handoverSelectTopics); return; }
    const notesResult = handoverNotesSchema.safeParse(notes);
    if (!notesResult.success) {
      toast.error(notesResult.error.errors[0].message);
      return;
    }
    updateHandover({
      ...editingHandover,
      toMemberId: toMember,
      topicIds: selectedTopics,
      notes: notesResult.data,
    });
    setEditOpen(false);
    resetForm();
  };

  const toggleTopic = (id: string) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExportCsv = () => {
    const header = `${t.absentPerson},${t.covers},${t.topicsToTransfer},${t.notes},${t.created}`;
    const rows = filteredHandovers.map((h) => {
      const from = members.find((m) => m.id === h.fromMemberId);
      const to = members.find((m) => m.id === h.toMemberId);
      const topics = workTopics
        .filter((tp) => h.topicIds.includes(tp.id))
        .map((tp) => tp.name)
        .join("; ");
      const escapedNotes = `"${h.notes.replace(/"/g, '""')}"`;
      return `${from?.name ?? ""},${to?.name ?? ""},${topics},${escapedNotes},${h.createdAt}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `handovers_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderFormFields = (isEdit: boolean) => {
    const editFromTopics = isEdit && editingHandover
      ? workTopics.filter((tp) => tp.memberId === editingHandover.fromMemberId)
      : fromMemberTopics;
    const editFromMember = isEdit && editingHandover
      ? members.find((m) => m.id === editingHandover.fromMemberId)
      : null;

    return (
      <div className="space-y-4">
        {isEdit ? (
          <div>
            <Label>{t.absentPerson}</Label>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-status-sick/10 text-status-sick font-semibold">
                  {editFromMember?.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {editFromMember?.name}
            </div>
          </div>
        ) : (
          <div>
            <Label>{t.absentPerson}</Label>
            <Select value={fromMember} onValueChange={(v) => { setFromMember(v); setSelectedTopics([]); }}>
              <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
              <SelectContent>
                {membersWithAbsence.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>{t.covers}</Label>
          <Select value={toMember} onValueChange={setToMember}>
            <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
            <SelectContent>
              {members
                .filter((m) => m.id !== (isEdit ? editingHandover?.fromMemberId : fromMember))
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {editFromTopics.length > 0 && (
          <div>
            <Label>{t.topicsToTransfer}</Label>
            <div className="space-y-2 mt-2">
              {editFromTopics.map((tp) => (
                <div key={tp.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTopics.includes(tp.id)}
                    onCheckedChange={() => toggleTopic(tp.id)}
                  />
                  <span className="text-sm">{tp.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>{t.notes}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPlaceholder} maxLength={1000} />
        </div>
        <Button onClick={isEdit ? handleEdit : handleAdd} className="w-full">
          {isEdit ? t.updateHandover : t.createHandover}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{t.handovers}</h1>
          <p className="text-muted-foreground mt-1">{t.handoversDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allTeams}</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1" /> {t.exportCsv}
          </Button>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl shadow-sm"><Plus className="h-4 w-4 mr-1" /> {t.createHandover}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-display">{t.newHandover}</DialogTitle></DialogHeader>
              {renderFormFields(false)}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">{t.editHandover}</DialogTitle></DialogHeader>
          {renderFormFields(true)}
        </DialogContent>
      </Dialog>

      <motion.div className="grid gap-3 sm:grid-cols-2" variants={container} initial="hidden" animate="show">
        {filteredHandovers.length === 0 ? (
          <Card className="col-span-2 border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              {t.noHandovers}
            </CardContent>
          </Card>
        ) : (
          filteredHandovers.map((h) => {
            const from = members.find((m) => m.id === h.fromMemberId);
            const to = members.find((m) => m.id === h.toMemberId);
            const topics = workTopics.filter((tp) => h.topicIds.includes(tp.id));
            return (
              <motion.div key={h.id} variants={item}>
                <Card className="hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-status-sick/10 text-status-sick font-semibold">{from?.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{from?.name}</span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-status-available/10 text-status-available font-semibold">{to?.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{to?.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t.deleteHandoverTitle}</AlertDialogTitle>
                              <AlertDialogDescription>{t.deleteHandoverDesc}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteHandover(h.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {t.confirmDelete}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {topics.map((tp) => (
                          <span key={tp.id} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium">{tp.name}</span>
                        ))}
                      </div>
                    )}
                    {h.notes && <p className="text-xs text-muted-foreground leading-relaxed">{h.notes}</p>}
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{t.created}: {h.createdAt}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
