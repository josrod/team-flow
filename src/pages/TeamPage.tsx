import { useParams } from "react-router-dom";
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
import { Search, Plus, Pencil, Trash2, X, Check } from "lucide-react";
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

  const openEditTopic = (tp: WorkTopic) => {
    setEditingTopic(tp);
    setTopicName(tp.name);
    setTopicDesc(tp.description);
    setTopicStatus(tp.status);
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

  if (!team) return <p className="text-muted-foreground">{t.teamNotFound}</p>;

  const memberTopics = selectedMember ? workTopics.filter((tp) => tp.memberId === selectedMember.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{team.name}</h1>
          <p className="text-muted-foreground mt-1">{teamMembers.length} {t.members.toLowerCase()}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl shadow-sm"><Plus className="h-4 w-4 mr-1" /> {t.add}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">{t.newMember}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t.name}</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div><Label>{t.role}</Label><Input value={newRole} onChange={(e) => setNewRole(e.target.value)} /></div>
              <Button onClick={handleAdd} className="w-full">{t.add}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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

      <Sheet open={!!selectedMember} onOpenChange={(o) => { if (!o) { setSelectedMember(null); setTopicFormOpen(false); } }}>
        <SheetContent className="overflow-auto">
          {selectedMember && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{selectedMember.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="flex items-center gap-2 font-display">
                      {selectedMember.name}
                      <StatusBadge status={getMemberStatus(selectedMember.id)} />
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedMember.role}</p>
                  </div>
                </div>
              </SheetHeader>

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
                          <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder={t.topicName} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">{t.description}</Label>
                          <Textarea value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} placeholder={t.descPlaceholder} className="min-h-[60px] text-sm" />
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
                    <Card key={tp.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{tp.name}</p>
                          <div className="flex items-center gap-1">
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
