import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function HandoversPage() {
  const { members, absences, workTopics, handovers, addHandover, deleteHandover } = useApp();
  const { t } = useLang();
  const [addOpen, setAddOpen] = useState(false);
  const [fromMember, setFromMember] = useState("");
  const [toMember, setToMember] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const membersWithAbsence = members.filter((m) =>
    absences.some((a) => a.memberId === m.id && a.endDate >= today)
  );

  const fromMemberAbsence = absences.find(
    (a) => a.memberId === fromMember && a.endDate >= today
  );

  const fromMemberTopics = workTopics.filter((tp) => tp.memberId === fromMember);

  const handleAdd = () => {
    if (!fromMember || !toMember || !fromMemberAbsence || selectedTopics.length === 0) return;
    addHandover({
      fromMemberId: fromMember,
      toMemberId: toMember,
      absenceId: fromMemberAbsence.id,
      topicIds: selectedTopics,
      notes,
    });
    setAddOpen(false);
    setFromMember("");
    setToMember("");
    setSelectedTopics([]);
    setNotes("");
  };

  const toggleTopic = (id: string) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{t.handovers}</h1>
          <p className="text-muted-foreground mt-1">{t.handoversDesc}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl shadow-sm"><Plus className="h-4 w-4 mr-1" /> {t.createHandover}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="font-display">{t.newHandover}</DialogTitle></DialogHeader>
            <div className="space-y-4">
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
              <div>
                <Label>{t.covers}</Label>
                <Select value={toMember} onValueChange={setToMember}>
                  <SelectTrigger><SelectValue placeholder={t.select} /></SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => m.id !== fromMember).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fromMember && fromMemberTopics.length > 0 && (
                <div>
                  <Label>{t.topicsToTransfer}</Label>
                  <div className="space-y-2 mt-2">
                    {fromMemberTopics.map((tp) => (
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
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPlaceholder} />
              </div>
              <Button onClick={handleAdd} className="w-full">{t.createHandover}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div className="grid gap-3 sm:grid-cols-2" variants={container} initial="hidden" animate="show">
        {handovers.length === 0 ? (
          <Card className="col-span-2 border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              {t.noHandovers}
            </CardContent>
          </Card>
        ) : (
          handovers.map((h) => {
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteHandover(h.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
