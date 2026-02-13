import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { importDataSchema } from "@/lib/validation";
import { Team, TeamMember, WorkTopic, Absence, Handover } from "@/types";
import {
  teams as seedTeams,
  members as seedMembers,
  workTopics as seedTopics,
  absences as seedAbsences,
  handovers as seedHandovers,
} from "@/data/mock-data";
import { toast } from "sonner";

const STORAGE_KEY = "teamflow-data";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data[key] ?? fallback;
  } catch {
    return fallback;
  }
}

interface AppState {
  teams: Team[];
  members: TeamMember[];
  workTopics: WorkTopic[];
  absences: Absence[];
  handovers: Handover[];
  addTeam: (name: string, icon?: string) => void;
  deleteTeam: (id: string) => void;
  addMember: (m: Omit<TeamMember, "id">) => void;
  updateMember: (m: TeamMember) => void;
  deleteMember: (id: string) => void;
  addAbsence: (a: Omit<Absence, "id">) => void;
  deleteAbsence: (id: string) => void;
  addHandover: (h: Omit<Handover, "id" | "createdAt">) => void;
  deleteHandover: (id: string) => void;
  addWorkTopic: (t: Omit<WorkTopic, "id">) => void;
  updateWorkTopic: (t: WorkTopic) => void;
  deleteWorkTopic: (id: string) => void;
  updateTeamName: (id: string, name: string, icon?: string) => void;
  getMemberStatus: (memberId: string) => "available" | "vacation" | "sick-leave";
  resetData: () => void;
  exportData: () => string;
  importData: (json: string) => void;
}

const AppContext = createContext<AppState | null>(null);

let uid = 100;
const genId = (prefix: string) => `${prefix}-${++uid}`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>(() => loadFromStorage("teams", seedTeams));
  const [members, setMembers] = useState<TeamMember[]>(() => loadFromStorage("members", seedMembers));
  const [workTopics, setWorkTopics] = useState<WorkTopic[]>(() => loadFromStorage("workTopics", seedTopics));
  const [absences, setAbsences] = useState<Absence[]>(() => loadFromStorage("absences", seedAbsences));
  const [handovers, setHandovers] = useState<Handover[]>(() => loadFromStorage("handovers", seedHandovers));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ teams, members, workTopics, absences, handovers }));
  }, [teams, members, workTopics, absences, handovers]);

  const getMemberStatus = useCallback(
    (memberId: string): "available" | "vacation" | "sick-leave" => {
      const today = new Date().toISOString().split("T")[0];
      const active = absences.find(
        (a) => a.memberId === memberId && a.startDate <= today && a.endDate >= today
      );
      return active ? active.type : "available";
    },
    [absences]
  );

  const value: AppState = {
    teams,
    members,
    workTopics,
    absences,
    handovers,
    getMemberStatus,
    updateTeamName: (id, name, icon?) => {
      setTeams((t) => t.map((x) => (x.id === id ? { ...x, name, ...(icon !== undefined && { icon }) } : x)));
      toast.success("✏️", { description: `Team renamed to "${name}"` });
    },
    addTeam: (name, icon?) => {
      const id = genId("team");
      setTeams((prev) => [...prev, { id, name, icon: icon || "users" }]);
      toast.success("🏢", { description: `Equipo "${name}" creado` });
    },
    deleteTeam: (id) => {
      const team = teams.find((x) => x.id === id);
      const teamMemberIds = members.filter((m) => m.teamId === id).map((m) => m.id);
      setTeams((prev) => prev.filter((x) => x.id !== id));
      setMembers((prev) => prev.filter((x) => x.teamId !== id));
      setWorkTopics((prev) => prev.filter((x) => !teamMemberIds.includes(x.memberId)));
      setAbsences((prev) => prev.filter((x) => !teamMemberIds.includes(x.memberId)));
      toast.success("🗑️", { description: `Equipo "${team?.name}" eliminado` });
    },
    addMember: (m) => {
      setMembers((prev) => [...prev, { ...m, id: genId("member") }]);
      toast.success("👤", { description: `${m.name} added` });
    },
    updateMember: (m) => {
      setMembers((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      toast.success("✏️", { description: `${m.name} updated` });
    },
    deleteMember: (id) => {
      const name = members.find((x) => x.id === id)?.name;
      setMembers((prev) => prev.filter((x) => x.id !== id));
      setWorkTopics((prev) => prev.filter((x) => x.memberId !== id));
      setAbsences((prev) => prev.filter((x) => x.memberId !== id));
      toast.success("🗑️", { description: `${name} removed` });
    },
    addAbsence: (a) => {
      setAbsences((prev) => [...prev, { ...a, id: genId("abs") }]);
      const name = members.find((x) => x.id === a.memberId)?.name;
      toast.success("📅", { description: `Absence registered for ${name}` });
    },
    deleteAbsence: (id) => {
      setAbsences((prev) => prev.filter((x) => x.id !== id));
      toast.success("🗑️", { description: "Absence deleted" });
    },
    addHandover: (h) => {
      setHandovers((prev) => [
        ...prev,
        { ...h, id: genId("ho"), createdAt: new Date().toISOString().split("T")[0] },
      ]);
      const from = members.find((x) => x.id === h.fromMemberId)?.name;
      const to = members.find((x) => x.id === h.toMemberId)?.name;
      toast.success("🔄", { description: `Handover: ${from} → ${to}` });
    },
    deleteHandover: (id) => {
      setHandovers((prev) => prev.filter((x) => x.id !== id));
      toast.success("🗑️", { description: "Handover deleted" });
    },
    addWorkTopic: (t) => {
      setWorkTopics((prev) => [...prev, { ...t, id: genId("topic") }]);
      toast.success("📌", { description: `Topic "${t.name}" created` });
    },
    updateWorkTopic: (t) => {
      setWorkTopics((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      toast.success("✏️", { description: `Topic "${t.name}" updated` });
    },
    deleteWorkTopic: (id) => {
      const name = workTopics.find((x) => x.id === id)?.name;
      setWorkTopics((prev) => prev.filter((x) => x.id !== id));
      toast.success("🗑️", { description: `Topic "${name}" deleted` });
    },
    resetData: () => {
      setTeams(seedTeams);
      setMembers(seedMembers);
      setWorkTopics(seedTopics);
      setAbsences(seedAbsences);
      setHandovers(seedHandovers);
      localStorage.removeItem(STORAGE_KEY);
      toast.success("🔄", { description: "Data reset to defaults" });
    },
    exportData: () => {
      return JSON.stringify({ teams, members, workTopics, absences, handovers }, null, 2);
    },
    importData: (json: string) => {
      try {
        const raw = JSON.parse(json);
        const result = importDataSchema.safeParse(raw);
        if (!result.success) {
          const msg = result.error.errors.map((e) => e.message).join(", ");
          toast.error(`Esquema inválido: ${msg}`);
          return;
        }
        const data = result.data;
        if (data.teams) setTeams(data.teams as Team[]);
        if (data.members) setMembers(data.members as TeamMember[]);
        if (data.workTopics) setWorkTopics(data.workTopics as WorkTopic[]);
        if (data.absences) setAbsences(data.absences as Absence[]);
        if (data.handovers) setHandovers(data.handovers as Handover[]);
        toast.success("📥", { description: "Datos importados correctamente" });
      } catch {
        toast.error("Error al importar: archivo JSON inválido");
      }
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
