import { useParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, TopicStatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { MemberStatus, TeamMember, WorkTopic, WorkTopicStatus } from "@/types";
import { Search, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teams, members, workTopics, getMemberStatus, addMember, updateMember, deleteMember, addWorkTopic, updateWorkTopic, deleteWorkTopic } = useApp();

  const team = teams.find((t) => t.id === teamId);
  const teamMembers = members.filter((m) => m.teamId === teamId);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");

  // Topic form state
  const [topicFormOpen, setTopicFormOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<WorkTopic | null>(null);
  const [topicName, setTopicName] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [topicStatus, setTopicStatus] = useState<WorkTopicStatus>("pending");

  const filtered = teamMembers
    .filter((m) => (filter === "all" ? true : getMemberStatus(m.id) === filter))
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = () => {
    if (!newName || !newRole || !teamId) return;
    addMember({ name: newName, role: newRole, teamId });
    setNewName("");
    setNewRole("");
    setAddOpen(false);
  };

  const openNewTopic = () => {
    setEditingTopic(null);
    setTopicName("");
    setTopicDesc("");
    setTopicStatus("pending");
    setTopicFormOpen(true);
  };

  const openEditTopic = (t: WorkTopic) => {
    setEditingTopic(t);
    setTopicName(t.name);
    setTopicDesc(t.description);
    setTopicStatus(t.status);
    setTopicFormOpen(true);
  };

  const saveTopic = () => {
    if (!topicName || !selectedMember) return;
    if (editingTopic) {
      updateWorkTopic({ ...editingTopic, name: topicName, description: topicDesc, status: topicStatus });
    } else {
      addWorkTopic({ memberId: selectedMember.id, name: topicName, description: topicDesc, status: topicStatus });
    }
    setTopicFormOpen(false);
  };

  if (!team) return <p className="text-muted-foreground">Equipo no encontrado</p>;

  const memberTopics = selectedMember ? workTopics.filter((t) => t.memberId === selectedMember.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground">{teamMembers.length} miembros</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo miembro</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div><Label>Rol</Label><Input value={newRole} onChange={(e) => setNewRole(e.target.value)} /></div>
              <Button onClick={handleAdd} className="w-full">Añadir</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponibles</SelectItem>
            <SelectItem value="vacation">Vacaciones</SelectItem>
            <SelectItem value="sick-leave">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <Card key={m.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedMember(m)}>
            <CardContent className="p-4 flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{m.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.role}</p>
              </div>
              <StatusBadge status={getMemberStatus(m.id)} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Member detail sheet */}
      <Sheet open={!!selectedMember} onOpenChange={(o) => { if (!o) { setSelectedMember(null); setTopicFormOpen(false); } }}>
        <SheetContent className="overflow-auto">
          {selectedMember && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedMember.name}
                  <StatusBadge status={getMemberStatus(selectedMember.id)} />
                </SheetTitle>
                <p className="text-sm text-muted-foreground">{selectedMember.role}</p>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Temas de trabajo</h3>
                  <Button variant="outline" size="sm" onClick={openNewTopic}>
                    <Plus className="h-3 w-3 mr-1" /> Añadir tema
                  </Button>
                </div>

                {/* Topic form */}
                {topicFormOpen && (
                  <Card className="border-primary/30">
                    <CardContent className="p-3 space-y-3">
                      <div>
                        <Label className="text-xs">Nombre</Label>
                        <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Nombre del tema..." className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Descripción</Label>
                        <Textarea value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} placeholder="Descripción..." className="min-h-[60px] text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Estado</Label>
                        <Select value={topicStatus} onValueChange={(v) => setTopicStatus(v as WorkTopicStatus)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendiente</SelectItem>
                            <SelectItem value="in-progress">En progreso</SelectItem>
                            <SelectItem value="blocked">Bloqueado</SelectItem>
                            <SelectItem value="completed">Completado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveTopic} className="flex-1">
                          <Check className="h-3 w-3 mr-1" /> {editingTopic ? "Guardar" : "Crear"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTopicFormOpen(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {memberTopics.length === 0 && !topicFormOpen ? (
                  <p className="text-sm text-muted-foreground">Sin temas asignados</p>
                ) : (
                  memberTopics.map((t) => (
                    <Card key={t.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{t.name}</p>
                          <div className="flex items-center gap-1">
                            <TopicStatusBadge status={t.status} />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTopic(t)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteWorkTopic(t.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { deleteMember(selectedMember.id); setSelectedMember(null); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar miembro
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}