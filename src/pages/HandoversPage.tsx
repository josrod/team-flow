import { useApp } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export default function HandoversPage() {
  const { members, absences, workTopics, handovers, addHandover, deleteHandover } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [fromMember, setFromMember] = useState("");
  const [toMember, setToMember] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];

  // Members with upcoming/active absences
  const membersWithAbsence = members.filter((m) =>
    absences.some((a) => a.memberId === m.id && a.endDate >= today)
  );

  const fromMemberAbsence = absences.find(
    (a) => a.memberId === fromMember && a.endDate >= today
  );

  const fromMemberTopics = workTopics.filter((t) => t.memberId === fromMember);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Handovers</h1>
          <p className="text-muted-foreground">Gestión de traspasos de trabajo</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Crear handover</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nuevo handover</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Persona ausente</Label>
                <Select value={fromMember} onValueChange={(v) => { setFromMember(v); setSelectedTopics([]); }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {membersWithAbsence.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cubre</Label>
                <Select value={toMember} onValueChange={setToMember}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => m.id !== fromMember).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fromMember && fromMemberTopics.length > 0 && (
                <div>
                  <Label>Temas a traspasar</Label>
                  <div className="space-y-2 mt-2">
                    {fromMemberTopics.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedTopics.includes(t.id)}
                          onCheckedChange={() => toggleTopic(t.id)}
                        />
                        <span className="text-sm">{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>Notas</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instrucciones para el handover..." />
              </div>
              <Button onClick={handleAdd} className="w-full">Crear handover</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {handovers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay handovers.</p>
        ) : (
          handovers.map((h) => {
            const from = members.find((m) => m.id === h.fromMemberId);
            const to = members.find((m) => m.id === h.toMemberId);
            const topics = workTopics.filter((t) => h.topicIds.includes(t.id));
            const absence = absences.find((a) => a.id === h.absenceId);
            return (
              <Card key={h.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{from?.name}</span>
                      <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{to?.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteHandover(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {topics.map((t) => (
                        <span key={t.id} className="text-xs bg-muted px-2 py-0.5 rounded">{t.name}</span>
                      ))}
                    </div>
                  )}
                  {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                  <p className="text-xs text-muted-foreground">Creado: {h.createdAt}</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
