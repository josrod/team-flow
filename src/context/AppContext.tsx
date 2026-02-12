import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Team, TeamMember, WorkTopic, Absence, Handover } from "@/types";
import {
  teams as seedTeams,
  members as seedMembers,
  workTopics as seedTopics,
  absences as seedAbsences,
  handovers as seedHandovers,
} from "@/data/mock-data";

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
  updateTeamName: (id: string, name: string) => void;
  getMemberStatus: (memberId: string) => "available" | "vacation" | "sick-leave";
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

  // Persist to localStorage
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
    updateTeamName: (id, name) => setTeams((t) => t.map((x) => (x.id === id ? { ...x, name } : x))),
    addMember: (m) => setMembers((prev) => [...prev, { ...m, id: genId("member") }]),
    updateMember: (m) => setMembers((prev) => prev.map((x) => (x.id === m.id ? m : x))),
    deleteMember: (id) => {
      setMembers((prev) => prev.filter((x) => x.id !== id));
      setWorkTopics((prev) => prev.filter((x) => x.memberId !== id));
      setAbsences((prev) => prev.filter((x) => x.memberId !== id));
    },
    addAbsence: (a) => setAbsences((prev) => [...prev, { ...a, id: genId("abs") }]),
    deleteAbsence: (id) => setAbsences((prev) => prev.filter((x) => x.id !== id)),
    addHandover: (h) =>
      setHandovers((prev) => [
        ...prev,
        { ...h, id: genId("ho"), createdAt: new Date().toISOString().split("T")[0] },
      ]),
    deleteHandover: (id) => setHandovers((prev) => prev.filter((x) => x.id !== id)),
    addWorkTopic: (t) => setWorkTopics((prev) => [...prev, { ...t, id: genId("topic") }]),
    updateWorkTopic: (t) => setWorkTopics((prev) => prev.map((x) => (x.id === t.id ? t : x))),
    deleteWorkTopic: (id) => setWorkTopics((prev) => prev.filter((x) => x.id !== id)),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
