import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { importDataSchema } from "@/lib/validation";
import { validateHandoverTopicIds } from "@/lib/handoverValidation";
import { describeSupabaseError } from "@/lib/supabaseErrorMapping";

import { Team, TeamMember, WorkTopic, Absence, Handover, MemberStatus } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { translations } from "@/context/LanguageContext";

const lang = (): "es" | "en" => (localStorage.getItem("teamflow-lang") === "en" ? "en" : "es");
const tr = () => translations[lang()];

// Row → app-model mappers (snake_case ↔ camelCase)
type TeamRow = { id: string; name: string; icon: string | null; sort_order: number };
type MemberRow = {
  id: string; team_id: string; name: string; role: string; avatar: string | null;
  base_capacity: number | null; max_capacity: number | null; login_name: string | null;
};
type WorkTopicRow = {
  id: string; member_id: string; name: string; description: string;
  status: WorkTopic["status"]; reassigned_from: string | null;
};
type AbsenceRow = { id: string; member_id: string; type: Absence["type"]; start_date: string; end_date: string };
type HandoverRow = {
  id: string; from_member_id: string; to_member_id: string; absence_id: string;
  topic_ids: string[]; notes: string; handover_date: string;
};

const mapTeam = (r: TeamRow): Team => ({ id: r.id, name: r.name, icon: r.icon ?? undefined });
const mapMember = (r: MemberRow): TeamMember => ({
  id: r.id, teamId: r.team_id, name: r.name, role: r.role,
  avatar: r.avatar ?? undefined,
  baseCapacity: r.base_capacity ?? undefined,
  maxCapacity: r.max_capacity ?? undefined,
  loginName: r.login_name ?? undefined,
});
const mapWorkTopic = (r: WorkTopicRow): WorkTopic => ({
  id: r.id, memberId: r.member_id, name: r.name, description: r.description,
  status: r.status, reassignedFrom: r.reassigned_from ?? undefined,
});
const mapAbsence = (r: AbsenceRow): Absence => ({
  id: r.id, memberId: r.member_id, type: r.type,
  startDate: r.start_date, endDate: r.end_date,
});
const mapHandover = (r: HandoverRow): Handover => ({
  id: r.id, fromMemberId: r.from_member_id, toMemberId: r.to_member_id,
  absenceId: r.absence_id, topicIds: r.topic_ids ?? [], notes: r.notes,
  createdAt: r.handover_date,
});

const memberToRow = (m: Omit<TeamMember, "id"> & { id?: string }) => ({
  id: m.id, team_id: m.teamId, name: m.name, role: m.role,
  avatar: m.avatar ?? null, base_capacity: m.baseCapacity ?? null,
  max_capacity: m.maxCapacity ?? null, login_name: m.loginName ?? null,
});
const topicToRow = (t: Omit<WorkTopic, "id"> & { id?: string }) => ({
  id: t.id, member_id: t.memberId, name: t.name, description: t.description,
  status: t.status, reassigned_from: t.reassignedFrom ?? null,
});
const absenceToRow = (a: Omit<Absence, "id"> & { id?: string }) => ({
  id: a.id, member_id: a.memberId, type: a.type,
  start_date: a.startDate, end_date: a.endDate,
});
const handoverToRow = (h: Omit<Handover, "id"> & { id?: string }) => ({
  id: h.id, from_member_id: h.fromMemberId, to_member_id: h.toMemberId,
  absence_id: h.absenceId, topic_ids: h.topicIds, notes: h.notes,
  handover_date: h.createdAt,
});

const nowId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
  updateAbsence: (a: Absence) => void;
  deleteAbsence: (id: string) => void;
  addHandover: (h: Omit<Handover, "id" | "createdAt">) => boolean;
  updateHandover: (h: Handover) => boolean;
  deleteHandover: (id: string) => void;
  addWorkTopic: (t: Omit<WorkTopic, "id">) => void;
  updateWorkTopic: (t: WorkTopic) => void;
  deleteWorkTopic: (id: string) => void;
  updateTeamName: (id: string, name: string, icon?: string) => void;
  getMemberStatus: (memberId: string) => MemberStatus;
  resetData: () => void;
  exportData: () => string;
  importData: (json: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [workTopics, setWorkTopics] = useState<WorkTopic[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);

  // Initial load + realtime subscriptions
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [t, m, w, a, h] = await Promise.all([
        supabase.from("teams").select("*").order("sort_order"),
        supabase.from("members").select("*"),
        supabase.from("work_topics").select("*"),
        supabase.from("absences").select("*"),
        supabase.from("handovers").select("*"),
      ]);
      if (cancelled) return;
      if (t.data) setTeams(t.data.map((row) => mapTeam(row as TeamRow)));
      if (m.data) setMembers(m.data.map((row) => mapMember(row as MemberRow)));
      if (w.data) setWorkTopics(w.data.map((row) => mapWorkTopic(row as WorkTopicRow)));
      if (a.data) setAbsences(a.data.map((row) => mapAbsence(row as AbsenceRow)));
      if (h.data) setHandovers(h.data.map((row) => mapHandover(row as HandoverRow)));
    };

    load();

    const channel = supabase
      .channel("app-shared-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, (payload) => {
        setTeams((prev) => applyChange(prev, payload, mapTeam));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, (payload) => {
        setMembers((prev) => applyChange(prev, payload, mapMember));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "work_topics" }, (payload) => {
        setWorkTopics((prev) => applyChange(prev, payload, mapWorkTopic));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, (payload) => {
        setAbsences((prev) => applyChange(prev, payload, mapAbsence));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "handovers" }, (payload) => {
        setHandovers((prev) => applyChange(prev, payload, mapHandover));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const getMemberStatus = useCallback(
    (memberId: string): MemberStatus => {
      const today = new Date().toISOString().split("T")[0];
      const active = absences.find(
        (a) => a.memberId === memberId && a.startDate <= today && a.endDate >= today
      );
      return active ? active.type : "available";
    },
    [absences]
  );

  const guard = useCallback((): boolean => {
    if (!isAdmin) {
      toast.error(lang() === "es" ? "Solo el admin puede modificar datos" : "Only admins can modify data");
      return false;
    }
    return true;
  }, [isAdmin]);

  const value: AppState = useMemo(() => ({
    teams,
    members,
    workTopics,
    absences,
    handovers,
    getMemberStatus,
    updateTeamName: async (id, name, icon?) => {
      if (!guard()) return;
      setTeams((prev) => prev.map((x) => (x.id === id ? { ...x, name, ...(icon !== undefined && { icon }) } : x)));
      const patch: { name: string; icon?: string } = { name };
      if (icon !== undefined) patch.icon = icon;
      const { error } = await supabase.from("teams").update(patch).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("✏️", { description: `Team renamed to "${name}"` });
    },
    addTeam: async (name, icon?) => {
      if (!guard()) return;
      const id = nowId("team");
      setTeams((prev) => [...prev, { id, name, icon: icon || "users" }]);
      const { error } = await supabase.from("teams").insert({ id, name, icon: icon || "users" });
      if (error) return toast.error(error.message);
      toast.success("🏢", { description: tr().teamCreatedToast.replace("{name}", name) });
    },
    deleteTeam: async (id) => {
      if (!guard()) return;
      const team = teams.find((x) => x.id === id);
      setTeams((prev) => prev.filter((x) => x.id !== id));
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("🗑️", { description: tr().teamDeletedToast.replace("{name}", team?.name ?? "") });
    },
    addMember: async (m) => {
      if (!guard()) return;
      const id = nowId("member");
      setMembers((prev) => [...prev, { ...m, id }]);
      const { error } = await supabase.from("members").insert(memberToRow({ ...m, id }));
      if (error) return toast.error(error.message);
      toast.success("👤", { description: `${m.name} added` });
    },
    updateMember: async (m) => {
      if (!guard()) return;
      setMembers((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      const { id, ...rest } = memberToRow(m);
      const { error } = await supabase.from("members").update(rest).eq("id", m.id);
      if (error) return toast.error(error.message);
      toast.success("✏️", { description: `${m.name} updated` });
    },
    deleteMember: async (id) => {
      if (!guard()) return;
      const name = members.find((x) => x.id === id)?.name;
      setMembers((prev) => prev.filter((x) => x.id !== id));
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("🗑️", { description: `${name} removed` });
    },
    addAbsence: async (a) => {
      if (!guard()) return;
      const id = nowId("abs");
      setAbsences((prev) => [...prev, { ...a, id }]);
      const { error } = await supabase.from("absences").insert(absenceToRow({ ...a, id }));
      if (error) return toast.error(error.message);
      const name = members.find((x) => x.id === a.memberId)?.name;
      toast.success("📅", { description: `Absence registered for ${name}` });
    },
    updateAbsence: async (a) => {
      if (!guard()) return;
      setAbsences((prev) => prev.map((x) => (x.id === a.id ? a : x)));
      const { id, ...rest } = absenceToRow(a);
      const { error } = await supabase.from("absences").update(rest).eq("id", a.id);
      if (error) return toast.error(error.message);
      const name = members.find((x) => x.id === a.memberId)?.name;
      toast.success("✏️", { description: `Absence updated for ${name}` });
    },
    deleteAbsence: async (id) => {
      if (!guard()) return;
      setAbsences((prev) => prev.filter((x) => x.id !== id));
      const { error } = await supabase.from("absences").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("🗑️", { description: "Absence deleted" });
    },
    addHandover: (h) => {
      if (!guard()) return false;
      const validation = validateHandoverTopicIds(h.topicIds, workTopics.map((t) => t.id));
      if (!validation.valid) {
        toast.error(validation.message ?? tr().invalidHandover);
        return false;
      }
      const id = nowId("ho");
      const createdAt = new Date().toISOString().split("T")[0];
      setHandovers((prev) => [...prev, { ...h, id, createdAt }]);
      void supabase.from("handovers").insert(handoverToRow({ ...h, id, createdAt }))
        .then(({ error }) => {
          if (error) return toast.error(error.message);
          const from = members.find((x) => x.id === h.fromMemberId)?.name;
          const to = members.find((x) => x.id === h.toMemberId)?.name;
          toast.success("🔄", { description: `Handover: ${from} → ${to}` });
        });
      return true;
    },
    updateHandover: (h) => {
      if (!guard()) return false;
      const validation = validateHandoverTopicIds(h.topicIds, workTopics.map((t) => t.id));
      if (!validation.valid) {
        toast.error(validation.message ?? tr().invalidHandover);
        return false;
      }
      setHandovers((prev) => prev.map((x) => (x.id === h.id ? h : x)));
      const { id, ...rest } = handoverToRow(h);
      void supabase.from("handovers").update(rest).eq("id", h.id)
        .then(({ error }) => {
          if (error) return toast.error(error.message);
          const from = members.find((x) => x.id === h.fromMemberId)?.name;
          const to = members.find((x) => x.id === h.toMemberId)?.name;
          toast.success("✏️", { description: `Handover ${from} → ${to} updated` });
        });
      return true;
    },
    deleteHandover: async (id) => {
      if (!guard()) return;
      setHandovers((prev) => prev.filter((x) => x.id !== id));
      const { error } = await supabase.from("handovers").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("🗑️", { description: "Handover deleted" });
    },
    addWorkTopic: async (t) => {
      if (!guard()) return;
      const id = nowId("topic");
      setWorkTopics((prev) => [...prev, { ...t, id }]);
      const { error } = await supabase.from("work_topics").insert(topicToRow({ ...t, id }));
      if (error) return toast.error(error.message);
      toast.success("📌", { description: `Topic "${t.name}" created` });
    },
    updateWorkTopic: async (t) => {
      if (!guard()) return;
      setWorkTopics((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      const { id, ...rest } = topicToRow(t);
      const { error } = await supabase.from("work_topics").update(rest).eq("id", t.id);
      if (error) return toast.error(error.message);
      toast.success("✏️", { description: `Topic "${t.name}" updated` });
    },
    deleteWorkTopic: async (id) => {
      if (!guard()) return;
      const name = workTopics.find((x) => x.id === id)?.name;
      setWorkTopics((prev) => prev.filter((x) => x.id !== id));
      const { error } = await supabase.from("work_topics").delete().eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("🗑️", { description: `Topic "${name}" deleted` });
    },
    resetData: () => {
      toast.info("Reset ya no está disponible: los datos son compartidos en la nube.");
    },
    exportData: () => JSON.stringify({ teams, members, workTopics, absences, handovers }, null, 2),
    importData: async (json: string) => {
      if (!guard()) return;
      const L = lang();
      const stepLabel = (step: string) =>
        L === "es"
          ? `Error importando ${step}`
          : `Error importing ${step}`;
      try {
        let raw: unknown;
        try {
          raw = JSON.parse(json);
        } catch (parseErr) {
          toast.error(tr().errImportInvalidJson, {
            description:
              parseErr instanceof Error ? parseErr.message : String(parseErr),
            duration: 8000,
          });
          return;
        }
        const result = importDataSchema.safeParse(raw);
        if (!result.success) {
          const details = result.error.errors
            .slice(0, 5)
            .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
            .join(" · ");
          toast.error(tr().invalidSchema.replace("{msg}", details), {
            duration: 10000,
          });
          return;
        }
        const data = result.data;
        const nextTopics = (data.workTopics as WorkTopic[] | undefined) ?? workTopics;
        if (data.handovers) {
          const validTopicIds = nextTopics.map((t) => t.id);
          const invalid = (data.handovers as Handover[]).find(
            (h) => !validateHandoverTopicIds(h.topicIds, validTopicIds).valid,
          );
          if (invalid) {
            toast.error(tr().importRejectedHandovers, { duration: 8000 });
            return;
          }
        }
        // Per-step runner that surfaces the exact table + reason on failure.
        const runStep = async (
          step: string,
          op: () => PromiseLike<{ error: unknown }>,
        ): Promise<boolean> => {
          const { error } = await op();

          if (error) {
            toast.error(stepLabel(step), {
              description: describeSupabaseError(error, L),
              duration: 10000,
            });
            return false;
          }
          return true;
        };

        // Wipe in dependency order (children first).
        if (!(await runStep("handovers", () => supabase.from("handovers").delete().neq("id", "")))) return;
        if (!(await runStep("work_topics", () => supabase.from("work_topics").delete().neq("id", "")))) return;
        if (!(await runStep("absences", () => supabase.from("absences").delete().neq("id", "")))) return;
        if (!(await runStep("members", () => supabase.from("members").delete().neq("id", "")))) return;
        if (!(await runStep("teams", () => supabase.from("teams").delete().neq("id", "")))) return;

        if (data.teams?.length) {
          if (!(await runStep("teams", () =>
            supabase.from("teams").insert(
              (data.teams as Team[]).map((t) => ({ id: t.id, name: t.name, icon: t.icon ?? "users" })),
            ),
          ))) return;
        }
        if (data.members?.length) {
          if (!(await runStep("members", () =>
            supabase.from("members").insert((data.members as TeamMember[]).map(memberToRow)),
          ))) return;
        }
        if (data.workTopics?.length) {
          if (!(await runStep("work_topics", () =>
            supabase.from("work_topics").insert((data.workTopics as WorkTopic[]).map(topicToRow)),
          ))) return;
        }
        if (data.absences?.length) {
          if (!(await runStep("absences", () =>
            supabase.from("absences").insert((data.absences as Absence[]).map(absenceToRow)),
          ))) return;
        }
        if (data.handovers?.length) {
          if (!(await runStep("handovers", () =>
            supabase.from("handovers").insert((data.handovers as Handover[]).map(handoverToRow)),
          ))) return;
        }
        toast.success("📥", { description: tr().dataImportedOk });
      } catch (err) {
        toast.error(tr().errImportInvalidJson, {
          description: describeSupabaseError(err, L),
          duration: 10000,
        });
      }
    },
  }), [teams, members, workTopics, absences, handovers, getMemberStatus, guard]);


  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Applies a realtime postgres_changes payload to a local array.
function applyChange<TRow extends { id: string }, TModel extends { id: string }>(
  prev: TModel[],
  payload: { eventType: string; new: TRow | Record<string, unknown>; old: TRow | Record<string, unknown> },
  mapRow: (r: TRow) => TModel,
): TModel[] {
  if (payload.eventType === "INSERT") {
    const row = mapRow(payload.new as TRow);
    if (prev.some((x) => x.id === row.id)) return prev;
    return [...prev, row];
  }
  if (payload.eventType === "UPDATE") {
    const row = mapRow(payload.new as TRow);
    return prev.map((x) => (x.id === row.id ? row : x));
  }
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: string }).id;
    if (!id) return prev;
    return prev.filter((x) => x.id !== id);
  }
  return prev;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
