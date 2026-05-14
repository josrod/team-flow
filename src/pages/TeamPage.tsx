import { useParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, TopicStatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { MemberStatus, TeamMember, WorkTopic, WorkTopicStatus } from "@/types";
import { Search, Plus, Pencil, Trash2, X, Check, ArrowRightLeft, RotateCcw, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { memberSchema, topicSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const itemAnim = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
};

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teams, members, workTopics, getMemberStatus, addMember, updateMember, deleteMember, addWorkTopic, updateWorkTopic, deleteWorkTopic } = useApp();
  const { t } = useLang();

  const team = teams.find((tm) => tm.id === teamId);
  const teamMembers = members.filter((m) => m.teamId === teamId);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newLoginName, setNewLoginName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editingRole, setEditingRole] = useState(false);
  const [editRoleValue, setEditRoleValue] = useState("");
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [resetCapacityConfirm, setResetCapacityConfirm] = useState(false);

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkSelectedMembers, setBulkSelectedMembers] = useState<string[]>([]);
  const [bulkMaxCapacity, setBulkMaxCapacity] = useState<string>("");
  const [bulkBaseCapacity, setBulkBaseCapacity] = useState<string>("");

  const [topicFormOpen, setTopicFormOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<WorkTopic | null>(null);
  const [topicName, setTopicName] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [topicStatus, setTopicStatus] = useState<WorkTopicStatus>("pending");
  const [topicAssignee, setTopicAssignee] = useState("");

  const filtered = teamMembers
    .filter((m) => (filter === "all" ? true : getMemberStatus(m.id) === filter))
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = () => {
    if (!teamId) return;
    const result = memberSchema.safeParse({ name: newName, role: newRole, teamId });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    addMember({
      name: result.data.name,
      role: result.data.role,
      teamId,
      loginName: newLoginName.trim() ? newLoginName.trim() : undefined,
    });
    setNewName("");
    setNewRole("");
    setNewLoginName("");
    setAddOpen(false);
  };

  const handleBulkEdit = () => {
    if (bulkSelectedMembers.length === 0) {
      toast.error(t.errSelectMember);
      return;
    }
    const maxVal = bulkMaxCapacity === "" ? undefined : parseInt(bulkMaxCapacity);
    const baseVal = bulkBaseCapacity === "" ? undefined : parseInt(bulkBaseCapacity);
    
    if (maxVal !== undefined && (isNaN(maxVal) || maxVal < 0)) {
      toast.error(t.errInvalidMaxCapacity);
      return;
    }
    if (baseVal !== undefined && (isNaN(baseVal) || baseVal < 0)) {
      toast.error(t.errInvalidBaseCapacity);
      return;
    }
    
    if (maxVal !== undefined && baseVal !== undefined && baseVal > maxVal) {
      toast.error(t.errBaseGtMax);
      return;
    }

    let hasConflict = false;
    bulkSelectedMembers.forEach(id => {
      const member = teamMembers.find(m => m.id === id);
      if (member) {
        const finalMax = maxVal !== undefined ? maxVal : (member.maxCapacity ?? 40);
        const finalBase = baseVal !== undefined ? baseVal : (member.baseCapacity ?? Math.round((member.maxCapacity ?? 40) * 0.8));
        if (finalBase > finalMax) {
          hasConflict = true;
        }
      }
    });

    if (hasConflict) {
      toast.error(t.errBulkConflict);
      return;
    }

    bulkSelectedMembers.forEach(id => {
      const member = teamMembers.find(m => m.id === id);
      if (member) {
        updateMember({
          ...member,
          maxCapacity: maxVal !== undefined ? maxVal : member.maxCapacity,
          baseCapacity: baseVal !== undefined ? baseVal : member.baseCapacity,
        });
      }
    });

    toast.success(t.capacityUpdated.replace('{count}', String(bulkSelectedMembers.length)));
    setBulkEditOpen(false);
    setBulkSelectedMembers([]);
    setBulkMaxCapacity("");
    setBulkBaseCapacity("");
  };

  const openNewTopic = () => {
    setEditingTopic(null);
    setTopicName("");
    setTopicDesc("");
    setTopicStatus("pending");
    setTopicAssignee(selectedMember?.id || "");
    setTopicFormOpen(true);
  };

  const openEditTopic = (tp: WorkTopic) => {
    setEditingTopic(tp);
    setTopicName(tp.name);
    setTopicDesc(tp.description);
    setTopicStatus(tp.status);
    setTopicAssignee(tp.memberId);
    setTopicFormOpen(true);
  };

  const saveTopic = () => {
    if (!selectedMember) return;
    const result = topicSchema.safeParse({ name: topicName, description: topicDesc, status: topicStatus });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    if (editingTopic) {
      const wasReassigned = topicAssignee && topicAssignee !== editingTopic.memberId;
      updateWorkTopic({
        ...editingTopic,
        name: result.data.name,
        description: result.data.description,
        status: result.data.status,
        memberId: topicAssignee || editingTopic.memberId,
        reassignedFrom: wasReassigned ? editingTopic.memberId : editingTopic.reassignedFrom,
      });
    } else {
      addWorkTopic({ memberId: selectedMember.id, name: result.data.name, description: result.data.description, status: result.data.status });
    }
    setTopicFormOpen(false);
  };

  if (!team) return <p className="text-muted-foreground">{t.teamNotFound}</p>;

  const memberTopics = selectedMember ? workTopics.filter((tp) => tp.memberId === selectedMember.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground mt-1">{teamMembers.length} {t.members.toLowerCase()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl shadow-sm" onClick={() => setBulkEditOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Edición en Bloque
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl shadow-sm"><Plus className="h-4 w-4 mr-1" /> {t.add}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">{t.newMember}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{t.name}</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} /></div>
                <div><Label>{t.role}</Label><Input value={newRole} onChange={(e) => setNewRole(e.target.value)} maxLength={50} /></div>
                <div>
                  <Label>{t.loginName}</Label>
                  <Input
                    value={newLoginName}
                    onChange={(e) => setNewLoginName(e.target.value)}
                    maxLength={50}
                    placeholder={t.loginNamePlaceholder}
                  />
                </div>
                <Button onClick={handleAdd} className="w-full">{t.add}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{t.bulkCapacityEditTitle}</DialogTitle></DialogHeader>
          <div className="space-y-6 mt-2">
            <div>
              <Label className="mb-2 block">Miembros ({bulkSelectedMembers.length} seleccionados)</Label>
              <div className="max-h-[200px] overflow-y-auto p-2 border rounded-md grid grid-cols-2 gap-2">
                {teamMembers.map(m => (
                  <div key={m.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`bulk-member-${m.id}`}
                      checked={bulkSelectedMembers.includes(m.id)}
                      onCheckedChange={(checked) => {
                        if (checked) setBulkSelectedMembers([...bulkSelectedMembers, m.id]);
                        else setBulkSelectedMembers(bulkSelectedMembers.filter(id => id !== m.id));
                      }}
                    />
                    <label htmlFor={`bulk-member-${m.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                      {m.name}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkSelectedMembers(teamMembers.map(m => m.id))}>Seleccionar Todos</Button>
                <Button variant="outline" size="sm" onClick={() => setBulkSelectedMembers([])}>Deseleccionar Todos</Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Capacidad Máxima (h/sem)</Label>
                <Input 
                  type="number" 
                  min={0}
                  max={168}
                  placeholder="Ej. 40"
                  value={bulkMaxCapacity}
                  onChange={(e) => setBulkMaxCapacity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Capacidad Base (h/sem)</Label>
                <Input 
                  type="number" 
                  min={0}
                  max={168}
                  placeholder="Ej. 32"
                  value={bulkBaseCapacity}
                  onChange={(e) => setBulkBaseCapacity(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Nota: Los campos vacíos no modificarán el valor actual del miembro.
            </p>

            <Button onClick={handleBulkEdit} className="w-full">Aplicar Cambios</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t.search} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card shadow-sm" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[160px] bg-card shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all}</SelectItem>
            <SelectItem value="available">{t.available}</SelectItem>
            <SelectItem value="vacation">{t.vacation}</SelectItem>
            <SelectItem value="sick-leave">{t.sickLeave}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <motion.div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" variants={container} initial="hidden" animate="show">
        {filtered.map((m) => (
          <motion.div key={m.id} variants={itemAnim}>
            <Card className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200" onClick={() => setSelectedMember(m)}>
              <CardContent className="p-4 flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">{m.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
                <StatusBadge status={getMemberStatus(m.id)} />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Sheet open={!!selectedMember} onOpenChange={(o) => { if (!o) { setSelectedMember(null); setTopicFormOpen(false); setEditingName(false); setEditingRole(false); } }}>
        <SheetContent className="overflow-auto">
          {selectedMember && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{selectedMember.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          className="h-8 text-base font-display font-semibold"
                          autoFocus
                          maxLength={100}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editNameValue.trim().length < 2) { toast.error(t.errNameMinLength); return; }
                              const updated = { ...selectedMember, name: editNameValue.trim() };
                              updateMember(updated);
                              setSelectedMember(updated);
                              setEditingName(false);
                            }
                            if (e.key === "Escape") setEditingName(false);
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          if (editNameValue.trim().length < 2) { toast.error(t.errNameMinLength); return; }
                          const updated = { ...selectedMember, name: editNameValue.trim() };
                          updateMember(updated);
                          setSelectedMember(updated);
                          setEditingName(false);
                        }}><Check className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <SheetTitle className="flex items-center gap-2 font-display">
                        {selectedMember.name}
                        <StatusBadge status={getMemberStatus(selectedMember.id)} />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditNameValue(selectedMember.name); setEditingName(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </SheetTitle>
                    )}
                    {editingRole ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          value={editRoleValue}
                          onChange={(e) => setEditRoleValue(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          maxLength={50}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editRoleValue.trim().length < 2) { toast.error(t.errRoleMinLength); return; }
                              const updated = { ...selectedMember, role: editRoleValue.trim() };
                              updateMember(updated);
                              setSelectedMember(updated);
                              setEditingRole(false);
                            }
                            if (e.key === "Escape") setEditingRole(false);
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                          if (editRoleValue.trim().length < 2) { toast.error(t.errRoleMinLength); return; }
                          const updated = { ...selectedMember, role: editRoleValue.trim() };
                          updateMember(updated);
                          setSelectedMember(updated);
                          setEditingRole(false);
                        }}><Check className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingRole(false)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        {selectedMember.role}
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditRoleValue(selectedMember.role); setEditingRole(true); }}>
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      </p>
                    )}
                  </div>
                </div>
               </SheetHeader>

              <div className="grid grid-cols-2 gap-4 mt-6 relative">
                <div className="col-span-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t.capacityConfig}</h3>
                  {((selectedMember.maxCapacity !== undefined && selectedMember.maxCapacity !== 40 && selectedMember.maxCapacity !== 0) || 
                    (selectedMember.baseCapacity !== undefined && selectedMember.baseCapacity !== Math.round((selectedMember.maxCapacity ?? 40) * 0.8) && selectedMember.baseCapacity !== 0)) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setResetCapacityConfirm(true)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> {t.resetCapacity}
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t.maxCapacity}</Label>
                  <Input 
                    type="number" 
                    min={0}
                    max={168}
                    value={selectedMember.maxCapacity ?? 40}
                    onChange={(e) => {
                      if (e.target.value === "") {
                        const updated = { ...selectedMember, maxCapacity: undefined };
                        updateMember(updated);
                        setSelectedMember(updated);
                        return;
                      }
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 0) return;
                      const currentBase = selectedMember.baseCapacity ?? Math.round((selectedMember.maxCapacity ?? 40) * 0.8);
                      if (val < currentBase) {
                        toast.error(t.errMaxLtBase);
                        return;
                      }
                      const updated = { ...selectedMember, maxCapacity: val };
                      updateMember(updated);
                      setSelectedMember(updated);
                    }}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t.baseCapacity}</Label>
                  <Input 
                    type="number" 
                    min={0}
                    max={selectedMember.maxCapacity ?? 40}
                    value={selectedMember.baseCapacity ?? Math.round((selectedMember.maxCapacity ?? 40) * 0.8)}
                    onChange={(e) => {
                      if (e.target.value === "") {
                        const updated = { ...selectedMember, baseCapacity: undefined };
                        updateMember(updated);
                        setSelectedMember(updated);
                        return;
                      }
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 0) return;
                      const currentMax = selectedMember.maxCapacity ?? 40;
                      if (val > currentMax) {
                        toast.error(t.errBaseGtMaxSingle);
                        return;
                      }
                      const updated = { ...selectedMember, baseCapacity: val };
                      updateMember(updated);
                      setSelectedMember(updated);
                    }}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <AlertDialog open={resetCapacityConfirm} onOpenChange={setResetCapacityConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.resetCapacityConfirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t.resetCapacityConfirmDesc.replace('{name}', selectedMember.name)}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => {
                        const previousMax = selectedMember.maxCapacity;
                        const previousBase = selectedMember.baseCapacity;
                        const updated = { ...selectedMember, maxCapacity: undefined, baseCapacity: undefined };
                        updateMember(updated);
                        setSelectedMember(updated);
                        toast.success(t.capacityResetSuccess, {
                          action: {
                            label: t.undo,
                            onClick: () => {
                              const restored = { ...selectedMember, maxCapacity: previousMax, baseCapacity: previousBase };
                              updateMember(restored);
                              setSelectedMember(restored);
                            }
                          }
                        });
                      }}
                    >
                      {t.resetCapacity}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {teams.length > 1 && (
                <div className="mt-4">
                  <Label className="text-xs text-muted-foreground">{t.team}</Label>
                  <Select
                    value={selectedMember.teamId}
                    onValueChange={(newTeamId) => {
                      if (newTeamId !== selectedMember.teamId) {
                        setPendingTeamId(newTeamId);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {teams.map((tm) => (
                        <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <AlertDialog open={pendingTeamId !== null} onOpenChange={(open) => { if (!open) setPendingTeamId(null); }}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.confirmMove ?? "Move member?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {(t.confirmMoveDesc ?? "Move {name} to {team}?")
                            .replace("{name}", selectedMember.name)
                            .replace("{team}", teams.find((tm) => tm.id === pendingTeamId)?.name ?? "")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                          if (pendingTeamId) {
                            const updated = { ...selectedMember, teamId: pendingTeamId };
                            updateMember(updated);
                            setSelectedMember(updated);
                          }
                          setPendingTeamId(null);
                        }}>{t.confirm ?? "Confirm"}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-sm">{t.workTopics}</h3>
                  <Button variant="outline" size="sm" onClick={openNewTopic} className="rounded-lg">
                    <Plus className="h-3 w-3 mr-1" /> {t.addTopic}
                  </Button>
                </div>

                {topicFormOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <Card className="border-primary/30 shadow-sm">
                      <CardContent className="p-3 space-y-3">
                        <div>
                          <Label className="text-xs">{t.name}</Label>
                          <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder={t.topicName} className="h-8 text-sm" maxLength={100} />
                        </div>
                        <div>
                          <Label className="text-xs">{t.description}</Label>
                          <Textarea value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} placeholder={t.descPlaceholder} className="min-h-[60px] text-sm" maxLength={500} />
                        </div>
                        <div>
                          <Label className="text-xs">{t.status}</Label>
                          <Select value={topicStatus} onValueChange={(v) => setTopicStatus(v as WorkTopicStatus)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">{t.pending}</SelectItem>
                              <SelectItem value="in-progress">{t.inProgress}</SelectItem>
                              <SelectItem value="blocked">{t.blocked}</SelectItem>
                              <SelectItem value="completed">{t.completed}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {editingTopic && (
                          <div>
                            <Label className="text-xs">Reassign to</Label>
                            <Select value={topicAssignee} onValueChange={setTopicAssignee}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {members.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name} <span className="text-muted-foreground ml-1">({teams.find(t => t.id === m.teamId)?.name})</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveTopic} className="flex-1">
                            <Check className="h-3 w-3 mr-1" /> {editingTopic ? t.save : t.create}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setTopicFormOpen(false)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {memberTopics.length === 0 && !topicFormOpen ? (
                  <p className="text-sm text-muted-foreground">{t.noTopics}</p>
                ) : (
                  memberTopics.map((tp) => (
                    <Card key={tp.id} className={cn("hover:shadow-sm transition-shadow", tp.reassignedFrom && "border-accent ring-1 ring-accent/30")}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {tp.reassignedFrom && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent-foreground px-1.5 py-0.5 text-[10px] font-medium shrink-0" title={`Reassigned from ${members.find(m => m.id === tp.reassignedFrom)?.name}`}>
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                {members.find(m => m.id === tp.reassignedFrom)?.name}
                              </span>
                            )}
                            <p className="font-medium text-sm truncate">{tp.name}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <TopicStatusBadge status={tp.status} />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTopic(tp)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteWorkTopic(tp.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{tp.description}</p>
                        {tp.reassignedFrom && (
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1 text-accent-foreground border-accent/40 hover:bg-accent/10 hover:border-accent"
                              onClick={() => {
                                updateWorkTopic({ ...tp, reassignedFrom: undefined });
                                toast.success("✅", { description: `"${tp.name}" acknowledged` });
                              }}
                            >
                              <Check className="h-2.5 w-2.5" />
                              Acknowledge
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { deleteMember(selectedMember.id); setSelectedMember(null); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> {t.deleteMember}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
