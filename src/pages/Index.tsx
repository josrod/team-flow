import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Search, Users, Pencil, Check, X, UserMinus, CalendarClock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const Index = () => {
  const { teams, members, absences, handovers, getMemberStatus, updateTeamName } = useApp();
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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

  const activeHandovers = handovers.filter((h) => {
    const absence = absences.find((a) => a.id === h.absenceId);
    return absence && absence.endDate >= today;
  });

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
          return (
            <motion.div key={team.id} variants={item}>
              <Card className="group hover:shadow-lg transition-all duration-300 border-transparent hover:border-primary/20 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary/60 to-primary/20" />
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  {editingTeamId === team.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-lg font-display font-semibold"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { updateTeamName(team.id, editName); setEditingTeamId(null); }
                          if (e.key === "Escape") setEditingTeamId(null);
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { updateTeamName(team.id, editName); setEditingTeamId(null); }}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTeamId(null)}>
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
                        onClick={(e) => { e.stopPropagation(); setEditingTeamId(team.id); setEditName(team.name); }}
                      >
                        <Pencil className="h-3 w-3" />
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
      </div>

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
    </motion.div>
  );
};

export default Index;
