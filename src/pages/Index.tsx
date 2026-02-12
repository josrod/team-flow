import { useApp } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Search, Users, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { teams, members, absences, handovers, getMemberStatus } = useApp();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Resumen general de tus equipos</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar personas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        {search && filteredMembers.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {filteredMembers.slice(0, 8).map((m) => (
              <button
                key={m.id}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  navigate(`/team/${m.teamId}`);
                  setSearch("");
                }}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{m.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span>{m.name}</span>
                <StatusBadge status={getMemberStatus(m.id)} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Team panels */}
      <div className="grid gap-6 md:grid-cols-2">
        {teams.map((team) => {
          const stats = teamStats(team.id);
          return (
            <Card
              key={team.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/team/${team.id}`)}
            >
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-xl">{team.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground">Miembros</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">{stats.absent}</p>
                    <p className="text-xs text-muted-foreground">Ausentes</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{stats.upcoming}</p>
                    <p className="text-xs text-muted-foreground">Próximas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active handovers */}
      <div>
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Handovers activos
        </h2>
        {activeHandovers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay handovers activos.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {activeHandovers.map((h) => {
              const from = members.find((m) => m.id === h.fromMemberId);
              const to = members.find((m) => m.id === h.toMemberId);
              return (
                <Card key={h.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{from?.name}</span>
                      <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{to?.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{h.notes}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
