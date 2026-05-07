import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, TopicStatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Search, Users, Pencil, Check, X, UserMinus, CalendarClock, Shield, Cpu, Rocket, Globe, Wrench, Database, Server, Plus, Trash2, type LucideIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { teamNameSchema } from "@/lib/validation";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const TEAM_ICONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "shield", icon: Shield, label: "Shield" },
  { key: "cpu", icon: Cpu, label: "CPU" },
  { key: "rocket", icon: Rocket, label: "Rocket" },
  { key: "globe", icon: Globe, label: "Globe" },
  { key: "wrench", icon: Wrench, label: "Wrench" },
  { key: "database", icon: Database, label: "Database" },
  { key: "server", icon: Server, label: "Server" },
  { key: "users", icon: Users, label: "Users" },
];

const getTeamIcon = (iconKey?: string): LucideIcon => {
  return TEAM_ICONS.find((i) => i.key === iconKey)?.icon || Users;
};

const Index = () => {
  const { teams, members, workTopics, absences, handovers, getMemberStatus, updateTeamName, updateWorkTopic, addTeam, deleteTeam } = useApp();
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamIcon, setNewTeamIcon] = useState("users");
  const [newIconPickerOpen, setNewIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const newIconPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIconPickerOpen(false);
      }
      if (newIconPickerRef.current && !newIconPickerRef.current.contains(e.target as Node)) {
        setNewIconPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const today = new Date().toISOString().split("T")[0];

  const filteredMembers = search
    ? members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const teamStats = (teamId: string) => {
    const teamMembers = members.filter((m) => m.teamId === teamId);
    const absent = teamMembers.filter((m) => getMemberStatus(m.id) !== "available");
    const upcoming = absences.filter(
      (a) => teamMembers.some((m) => m.id === a.memberId) && a.startDate > today
    );
    return { total: teamMembers.length, absent: absent.length, upcoming: upcoming.length };
  };

  const activeHandovers = handovers
    .filter((h) => {
      const absence = absences.find((a) => a.id === h.absenceId);
      return absence && absence.endDate >= today;
    })
    .map((h) => {
      const absence = absences.find((a) => a.id === h.absenceId);
      const isOngoing = absence ? absence.startDate <= today && absence.endDate >= today : false;
      return { handover: h, absence, isOngoing };
    })
    .sort((a, b) => {
      if (a.isOngoing !== b.isOngoing) return a.isOngoing ? -1 : 1;
      return (a.absence?.startDate ?? "").localeCompare(b.absence?.startDate ?? "");
    });

  const reassignedTopics = workTopics
    .filter((tp) => !!tp.reassignedFrom)
    .map((tp) => ({
      topic: tp,
      assignee: members.find((m) => m.id === tp.memberId),
      previousOwner: members.find((m) => m.id === tp.reassignedFrom),
      team: teams.find((tm) => tm.id === members.find((m) => m.id === tp.memberId)?.teamId),
    }));

  return (
    <motion.div className="space-y-8" variants={container} initial="hidden" animate="show">
      <motion.div variants={item}>
        <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight">{t.dashboard}</h1>
        <p className="text-muted-foreground mt-1">{t.dashboardDesc}</p>
      </motion.div>

      <motion.div className="relative max-w-md" variants={item}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t.searchPeople}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card shadow-sm"
        />
        {search && filteredMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden"
          >
            {filteredMembers.slice(0, 8).map((m) => (
              <button
                key={m.id}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors"
                onClick={() => { navigate(`/team/${m.teamId}`); setSearch(""); }}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{m.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{m.name}</span>
                <StatusBadge status={getMemberStatus(m.id)} />
              </button>
            ))}
          </motion.div>
        )}
      </motion.div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">
        {teams.map((team) => {
          const stats = teamStats(team.id);
          const TeamIcon = getTeamIcon(team.icon);
          const saveEdit = () => {
            const result = teamNameSchema.safeParse(editName);
            if (!result.success) { toast.error(result.error.errors[0].message); return; }
            updateTeamName(team.id, result.data, editIcon);
            setEditingTeamId(null);
            setIconPickerOpen(false);
          };
          return (
            <motion.div key={team.id} variants={item}>
              <Card className="group hover:shadow-lg transition-all duration-300 border-transparent hover:border-primary/20 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/20" />
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  {editingTeamId === team.id ? (
                    <div className="relative" ref={iconPickerRef} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                        onClick={() => setIconPickerOpen((v) => !v)}
                      >
                        {(() => { const I = getTeamIcon(editIcon); return <I className="h-5 w-5 text-primary" />; })()}
                      </button>
                      {iconPickerOpen && (
                        <div className="absolute top-12 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1 w-40">
                          {TEAM_ICONS.map((ti) => (
                            <button
                              key={ti.key}
                              type="button"
                              className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${editIcon === ti.key ? "bg-primary/20 text-primary" : "hover:bg-accent text-muted-foreground"}`}
                              onClick={() => { setEditIcon(ti.key); setIconPickerOpen(false); }}
                              title={ti.label}
                            >
                              <ti.icon className="h-4 w-4" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <TeamIcon className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  {editingTeamId === team.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-lg font-display font-semibold"
                          autoFocus
                          maxLength={100}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") { setEditingTeamId(null); setIconPickerOpen(false); }
                          }}
                        />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTeamId(null); setIconPickerOpen(false); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => navigate(`/team/${team.id}`)}>
                      <CardTitle className="text-xl font-display">{team.name}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); setEditingTeamId(team.id); setEditName(team.name); setEditIcon(team.icon || "users"); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar equipo "${team.name}" y todos sus miembros?`)) deleteTeam(team.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="cursor-pointer" onClick={() => navigate(`/team/${team.id}`)}>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { value: stats.total, label: t.members, icon: Users, color: "text-primary" },
                      { value: stats.absent, label: t.absent, icon: UserMinus, color: "text-status-vacation" },
                      { value: stats.upcoming, label: t.upcoming, icon: CalendarClock, color: "text-status-info" },
                    ].map((s) => (
                      <div key={s.label} className="text-center space-y-1">
                        <s.icon className={`h-4 w-4 mx-auto ${s.color} opacity-60`} />
                        <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}

        {/* Add new team card */}
        <motion.div variants={item}>
          {showNewTeam ? (
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary/40 to-primary/10" />
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative" ref={newIconPickerRef} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                      onClick={() => setNewIconPickerOpen((v) => !v)}
                    >
                      {(() => { const I = getTeamIcon(newTeamIcon); return <I className="h-5 w-5 text-primary" />; })()}
                    </button>
                    {newIconPickerOpen && (
                      <div className="absolute top-12 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1 w-40">
                        {TEAM_ICONS.map((ti) => (
                          <button
                            key={ti.key}
                            type="button"
                            className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${newTeamIcon === ti.key ? "bg-primary/20 text-primary" : "hover:bg-accent text-muted-foreground"}`}
                            onClick={() => { setNewTeamIcon(ti.key); setNewIconPickerOpen(false); }}
                            title={ti.label}
                          >
                            <ti.icon className="h-4 w-4" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input
                    placeholder="Nombre del equipo"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="h-10 text-lg font-display font-semibold"
                    autoFocus
                    maxLength={100}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const result = teamNameSchema.safeParse(newTeamName);
                        if (!result.success) { toast.error(result.error.errors[0].message); return; }
                        addTeam(result.data, newTeamIcon);
                        setNewTeamName(""); setNewTeamIcon("users"); setShowNewTeam(false);
                      }
                      if (e.key === "Escape") { setShowNewTeam(false); setNewTeamName(""); }
                    }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowNewTeam(false); setNewTeamName(""); }}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={() => {
                    const result = teamNameSchema.safeParse(newTeamName);
                    if (!result.success) { toast.error(result.error.errors[0].message); return; }
                    addTeam(result.data, newTeamIcon);
                    setNewTeamName(""); setNewTeamIcon("users"); setShowNewTeam(false);
                  }}>
                    <Check className="h-4 w-4 mr-1" /> Crear
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card
              className="border-dashed cursor-pointer hover:border-primary/40 hover:shadow-md transition-all duration-300 flex items-center justify-center min-h-[160px]"
              onClick={() => setShowNewTeam(true)}
            >
              <CardContent className="p-6 text-center">
                <Plus className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Añadir equipo</p>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* Reassigned Tasks Widget */}
      {reassignedTopics.length > 0 && (
        <motion.div variants={item}>
          <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
              <ArrowRightLeft className="h-4 w-4 text-accent-foreground" />
            </div>
            Reassigned Tasks
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold">
              {reassignedTopics.length}
            </span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {reassignedTopics.map(({ topic, assignee, previousOwner, team }) => (
              <motion.div
                key={topic.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="border-accent ring-1 ring-accent/30 hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-tight line-clamp-2">{topic.name}</p>
                      <TopicStatusBadge status={topic.status} />
                    </div>
                    {topic.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{topic.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-muted">{previousOwner?.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="line-through opacity-60">{previousOwner?.name}</span>
                      <ArrowRightLeft className="h-3 w-3 shrink-0" />
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{assignee?.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">{assignee?.name}</span>
                      {team && <span className="ml-auto text-[10px] text-muted-foreground/70 shrink-0">{team.name}</span>}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[10px] gap-1 text-accent-foreground border-accent/40 hover:bg-accent/10 hover:border-accent mt-1"
                      onClick={() => {
                        updateWorkTopic({ ...topic, reassignedFrom: undefined });
                        toast.success("✅", { description: `"${topic.name}" acknowledged` });
                      }}
                    >
                      <Check className="h-2.5 w-2.5" />
                      Acknowledge
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div variants={item}>
        <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
            <ArrowRightLeft className="h-4 w-4 text-accent-foreground" />
          </div>
          {t.activeHandovers}
        </h2>
        {activeHandovers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              {t.noActiveHandovers}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activeHandovers.map((h, i) => {
              const from = members.find((m) => m.id === h.fromMemberId);
              const to = members.find((m) => m.id === h.toMemberId);
              return (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-status-sick/10 text-status-sick">{from?.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{from?.name}</span>
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-status-available/10 text-status-available">{to?.name.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{to?.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{h.notes}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Analytics Panel */}
      <motion.div variants={item}>
        <AnalyticsPanel />
      </motion.div>
    </motion.div>
  );
};

export default Index;
