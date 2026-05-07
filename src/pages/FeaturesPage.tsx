import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
// Select removed in favor of a searchable combobox for the person picker.
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Loader2, RefreshCw, Cloud, Database, Search, Layers, ListChecks, Users as UsersIcon, ExternalLink, Copy, Check, ChevronsUpDown, X, Undo2, AlertTriangle, ShieldCheck, ShieldAlert, ChevronDown, EyeOff, MapPinOff, CalendarOff, User as UserIcon, AlertOctagon, CircleDashed, PlayCircle, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { listTfsFeatures, listTfsTasks, listTfsTeamAreaPaths, peekTfsAreaPathCache, peekTfsPeopleCache, peekTfsPeopleCacheForConnection, writeTfsPeopleCache, RODAT_AREA_PATH, RODAT_ITERATION_PATH, type TfsConnection, type TfsWorkItem } from "@/services/tfs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSearchParams, Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";

type DataSource = "tfs" | "local";

interface UnifiedFeature {
  id: string;
  title: string;
  state: string;
  assignee?: string;
  taskCount: number;
  doneCount: number;
}

interface UnifiedTask {
  id: string;
  title: string;
  state: string;
  type: string;
  assignee?: string;
  featureId?: string;
}

// Map a TFS state to a normalized bucket for charts/visuals
const normalizeState = (state: string): "active" | "pending" | "done" | "blocked" => {
  const s = state.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved") || s.includes("completed")) return "done";
  if (s.includes("block")) return "blocked";
  if (s.includes("active") || s.includes("progress") || s.includes("committed") || s.includes("doing")) return "active";
  return "pending";
};

const stateColorVar: Record<string, string> = {
  active: "hsl(var(--status-info))",
  pending: "hsl(var(--status-vacation))",
  done: "hsl(var(--status-available))",
  blocked: "hsl(var(--status-sick))",
};

const stateLabel: Record<string, string> = {
  active: "Activo",
  pending: "Pendiente",
  done: "Completado",
  blocked: "Bloqueado",
};

export default function FeaturesPage() {
  const { teams, members, workTopics } = useApp();
  const { user } = useAuth();

  const [source, setSource] = useState<DataSource>("local");
  const [loading, setLoading] = useState(false);
  const [tfsConnConfigured, setTfsConnConfigured] = useState(false);
  // Raw payloads as returned by TFS — kept untouched so the scope audit can
  // detect items that fall outside the required Rodat area/iteration. The UI
  // never reads these directly; it consumes the scoped derivations below.
  const [tfsFeaturesRaw, setTfsFeaturesRaw] = useState<TfsWorkItem[]>([]);
  const [tfsTasksRaw, setTfsTasksRaw] = useState<TfsWorkItem[]>([]);
  const [tfsError, setTfsError] = useState<string | null>(null);
  const [tfsBaseUrl, setTfsBaseUrl] = useState<string | null>(null);
  // Cached TFS connection (resolved from settings) so we can warm the area
  // path cache when the team filter changes, without re-querying Supabase.
  const [tfsConn, setTfsConn] = useState<TfsConnection | null>(null);
  // Area paths resolved during the most recent TFS load + whether that load
  // failed (feature/task fetch). Used to decide when to fall back to the
  // cached people list for the person selector.
  const [lastAreaPaths, setLastAreaPaths] = useState<string[]>([]);
  const [tfsLoadFailed, setTfsLoadFailed] = useState(false);
  // User-configured scope from the Settings page (multi-select dropdowns).
  // Empty arrays mean "use legacy Rodat defaults". These are the source of
  // truth for both the WIQL queries and the client-side scope audit.
  const [configuredAreaPaths, setConfiguredAreaPaths] = useState<string[]>([]);
  const [configuredIterationPaths, setConfiguredIterationPaths] = useState<string[]>([]);
  // True when the people list shown in the selector comes from the fallback
  // cache (i.e. the last load failed but we have a previous roster on hand).
  const [peopleFallbackStale, setPeopleFallbackStale] = useState(false);

  // Persisted open/closed state for the scope-audit panel and each of its
  // groups, so the user finds it as they last left it. Lazy initializer reads
  // localStorage once on mount; subsequent toggles re-persist.
  const AUDIT_STORAGE_KEY = "featuresPage:auditPanel";
  type AuditPanelState = {
    open: boolean;
    groups: { featuresArea: boolean; tasksArea: boolean; tasksIteration: boolean };
  };
  const defaultAuditState: AuditPanelState = {
    open: false,
    groups: { featuresArea: true, tasksArea: true, tasksIteration: true },
  };
  const [auditState, setAuditState] = useState<AuditPanelState>(() => {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (!raw) return defaultAuditState;
      const parsed = JSON.parse(raw) as Partial<AuditPanelState>;
      return {
        open: typeof parsed.open === "boolean" ? parsed.open : defaultAuditState.open,
        groups: { ...defaultAuditState.groups, ...(parsed.groups ?? {}) },
      };
    } catch {
      return defaultAuditState;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditState));
    } catch {
      // Storage may be unavailable; ignore.
    }
  }, [auditState]);
  const setAuditOpen = (open: boolean) => setAuditState((s) => ({ ...s, open }));
  const setGroupOpen = (group: keyof AuditPanelState["groups"], open: boolean) =>
    setAuditState((s) => ({ ...s, groups: { ...s.groups, [group]: open } }));

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTeam = searchParams.get("team") ?? "all";
  const activePerson = searchParams.get("person") ?? "all";
  const search = searchParams.get("q") ?? "";

  // Persist last-used filters in localStorage so the user keeps their context
  // when navigating away and back to the dashboard. The URL still wins when
  // present (so shared/bookmarked links keep working).
  const FILTERS_STORAGE_KEY = "featuresPage:lastFilters";

  // On first mount, if the URL has no filter params but localStorage does,
  // hydrate the URL from storage. This runs once.
  useEffect(() => {
    const hasUrlFilters =
      searchParams.has("team") || searchParams.has("person") || searchParams.has("q");
    if (hasUrlFilters) return;
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { team?: string; person?: string; q?: string };
      const next = new URLSearchParams(searchParams);
      let touched = false;
      if (saved.team && saved.team !== "all") { next.set("team", saved.team); touched = true; }
      if (saved.person && saved.person !== "all") { next.set("person", saved.person); touched = true; }
      if (saved.q) { next.set("q", saved.q); touched = true; }
      if (touched) setSearchParams(next, { replace: true });
    } catch {
      // Ignore malformed storage entries.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filters to localStorage whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({ team: activeTeam, person: activePerson, q: search }),
      );
    } catch {
      // Storage may be unavailable (private mode, quota); ignore.
    }
  }, [activeTeam, activePerson, search]);

  // "Confirmar cambios" mode: when enabled, filter edits are held in a local
  // draft and only pushed to the URL (and therefore the dashboard) when the
  // user clicks "Aplicar". This avoids multiple reloads while adjusting.
  const MANUAL_APPLY_STORAGE_KEY = "featuresPage:manualApply";
  const [manualApply, setManualApply] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MANUAL_APPLY_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_APPLY_STORAGE_KEY, manualApply ? "1" : "0");
    } catch {
      // Ignore storage errors.
    }
  }, [manualApply]);

  // Draft filter values. They mirror the applied (URL) values whenever the
  // user is NOT in manual-apply mode, or right after an apply/discard action.
  const [draftTeam, setDraftTeam] = useState<string>(activeTeam);
  const [draftPerson, setDraftPerson] = useState<string>(activePerson);
  const [draftSearch, setDraftSearch] = useState<string>(search);

  // Keep drafts in sync with applied values when manual-apply is off, so the
  // UI reflects changes driven from elsewhere (URL hydration, invalid-ID
  // normalization, etc.).
  useEffect(() => {
    if (!manualApply) {
      setDraftTeam(activeTeam);
      setDraftPerson(activePerson);
      setDraftSearch(search);
    }
  }, [manualApply, activeTeam, activePerson, search]);

  const commitFilters = (next: { team: string; person: string; q: string }) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!next.team || next.team === "all") params.delete("team"); else params.set("team", next.team);
        if (!next.person || next.person === "all") params.delete("person"); else params.set("person", next.person);
        if (!next.q) params.delete("q"); else params.set("q", next.q);
        return params;
      },
      { replace: true },
    );
  };

  const updateParam = (key: "team" | "person" | "q", value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === "all") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        // Reset person when team changes
        if (key === "team") next.delete("person");
        return next;
      },
      { replace: true },
    );
  };

  // Filter setters: route through drafts when manual-apply is on, otherwise
  // push directly to the URL (original behavior).
  const setActiveTeam = (v: string) => {
    if (manualApply) {
      setDraftTeam(v);
      // Reset person draft when team draft changes, mirroring URL behavior.
      setDraftPerson("all");
    } else {
      updateParam("team", v);
    }
  };
  const setActivePerson = (v: string) => {
    if (manualApply) setDraftPerson(v);
    else updateParam("person", v);
  };
  const setSearch = (v: string) => {
    if (manualApply) setDraftSearch(v);
    else updateParam("q", v);
  };

  const hasPendingChanges =
    manualApply &&
    (draftTeam !== activeTeam || draftPerson !== activePerson || draftSearch !== search);

  const applyDraft = () => {
    commitFilters({ team: draftTeam, person: draftPerson, q: draftSearch });
  };
  const discardDraft = () => {
    setDraftTeam(activeTeam);
    setDraftPerson(activePerson);
    setDraftSearch(search);
  };

  // Detect TFS settings on mount
  useEffect(() => {
    const detect = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("azure_devops_settings")
        .select("server_url, collection, project, team, pat_encrypted, area_paths, iteration_paths")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.server_url && data?.collection && data?.project && data?.pat_encrypted) {
        setTfsConnConfigured(true);
        setSource("tfs");
        await loadFromTfs(data);
      }
    };
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live-refresh: when the user changes the area/iteration scope in the
  // Settings page (in this tab or any other), the dashboard reloads so the
  // "Alcance efectivo" summary and the underlying queries stay in sync
  // without forcing a manual refresh. Compares the new arrays against the
  // currently-applied scope and only reloads on actual differences.
  useEffect(() => {
    if (!user) return;
    const sameSet = (a: string[] | null | undefined, b: string[]) => {
      const aa = (a ?? []).filter((p) => p && p.trim().length > 0);
      if (aa.length !== b.length) return false;
      const sortedA = [...aa].sort();
      const sortedB = [...b].sort();
      return sortedA.every((v, i) => v === sortedB[i]);
    };
    const channel = supabase
      .channel(`azure-devops-settings:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "azure_devops_settings",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as {
            server_url: string | null;
            collection: string | null;
            project: string | null;
            team: string | null;
            pat_encrypted: string | null;
            area_paths: string[] | null;
            iteration_paths: string[] | null;
          };
          if (!next.server_url || !next.collection || !next.project || !next.pat_encrypted) {
            return;
          }
          const areasChanged = !sameSet(next.area_paths, configuredAreaPaths);
          const itersChanged = !sameSet(next.iteration_paths, configuredIterationPaths);
          if (!areasChanged && !itersChanged) return;
          toast.info("Alcance actualizado en Ajustes — recargando datos…");
          void loadFromTfs({
            server_url: next.server_url,
            collection: next.collection,
            project: next.project,
            team: next.team,
            pat_encrypted: next.pat_encrypted,
            area_paths: next.area_paths,
            iteration_paths: next.iteration_paths,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, configuredAreaPaths, configuredIterationPaths]);

  const loadFromTfs = async (
    presetSettings?: {
      server_url: string | null;
      collection: string | null;
      project: string;
      team: string | null;
      pat_encrypted: string;
      area_paths?: string[] | null;
      iteration_paths?: string[] | null;
    },
    options: { forceAreaRefresh?: boolean } = {},
  ) => {
    if (!user) return;
    setLoading(true);
    setTfsError(null);
    try {
      let settings = presetSettings;
      if (!settings) {
        const { data } = await supabase
          .from("azure_devops_settings")
          .select("server_url, collection, project, team, pat_encrypted, area_paths, iteration_paths")
          .eq("user_id", user.id)
          .maybeSingle();
        settings = data ?? undefined;
      }
      if (!settings?.server_url || !settings?.collection || !settings?.project || !settings?.pat_encrypted) {
        setTfsError("Configuración de Azure DevOps incompleta. Mostrando datos locales.");
        setSource("local");
        return;
      }
      const conn = {
        serverUrl: settings.server_url,
        collection: settings.collection,
        project: settings.project,
        team: settings.team ?? undefined,
        pat: settings.pat_encrypted,
      };
      setTfsConn(conn);
      // Build base URL for "Open in Azure DevOps" links
      const cleanServer = settings.server_url.replace(/\/+$/, "");
      const cleanCollection = settings.collection.replace(/^\/+|\/+$/g, "");
      const cleanProject = settings.project.replace(/^\/+|\/+$/g, "");
      setTfsBaseUrl(`${cleanServer}/${cleanCollection}/${encodeURIComponent(cleanProject)}`);

      // User-configured scope from Settings (multi-select dropdowns). When
      // empty, the legacy Rodat defaults apply.
      const userAreas = (settings.area_paths ?? []).filter((p) => p && p.trim().length > 0);
      const userIters = (settings.iteration_paths ?? []).filter((p) => p && p.trim().length > 0);
      setConfiguredAreaPaths(userAreas);
      setConfiguredIterationPaths(userIters);

      // Resolve the area paths owned by the configured team so we can scope
      // both features and tasks to that team only (only used as a fallback
      // when the user has not picked explicit areas in Settings).
      let teamAreaPaths: string[] = [];
      if (userAreas.length === 0 && conn.team) {
        const areaRes = await listTfsTeamAreaPaths(conn, { force: options.forceAreaRefresh });
        if (areaRes.error) {
          // Non-fatal: warn but keep going without area filtering.
          toast.warning(`No se pudieron leer las áreas del equipo: ${areaRes.error.message}`);
        }
        teamAreaPaths = areaRes.items;
      }

      const [featRes, taskRes] = await Promise.all([
        listTfsFeatures(conn, teamAreaPaths, userAreas),
        listTfsTasks(conn, userAreas, userIters),
      ]);
      const loadHadError = Boolean(featRes.error || taskRes.error);
      if (featRes.error) {
        setTfsError(featRes.error.message);
        toast.error(`TFS: ${featRes.error.message}`);
      }
      // Client-side scope (defense in depth): use the explicit user scope when
      // available, otherwise fall back to Rodat areas / 4.4 iteration.
      const effectiveAreas =
        userAreas.length > 0
          ? userAreas
          : (() => {
              const rodatAreas = teamAreaPaths.filter(
                (p) => p === RODAT_AREA_PATH || p.startsWith(`${RODAT_AREA_PATH}\\`),
              );
              return rodatAreas.length > 0 ? rodatAreas : [RODAT_AREA_PATH];
            })();
      const effectiveIters = userIters.length > 0 ? userIters : [RODAT_ITERATION_PATH];
      const isUnderArea = (path: string | undefined, root: string) =>
        Boolean(path && (path === root || path.startsWith(`${root}\\`)));
      // Persist the raw payloads — the scoped derivations below filter what
      // the UI actually shows, while the audit banner inspects the raw lists
      // to detect any item TFS returned outside the required scope.
      setTfsFeaturesRaw(featRes.items);
      setTfsTasksRaw(taskRes.items);
      setLastAreaPaths(effectiveAreas);
      setTfsLoadFailed(loadHadError);

      // Warm the people cache on a successful load so a future failure can
      // degrade gracefully without emptying the person selector. Uses the
      // scoped task list so we never cache people from out-of-scope items.
      if (!loadHadError) {
        const peopleSet = new Set<string>();
        taskRes.items
          .filter(
            (t) =>
              effectiveAreas.some((p) => isUnderArea(t.areaPath, p)) &&
              effectiveIters.some((p) => isUnderArea(t.iterationPath, p)),
          )
          .forEach((t) => t.assignedTo && peopleSet.add(t.assignedTo));
        featRes.items
          .filter((f) => effectiveAreas.some((p) => isUnderArea(f.areaPath, p)))
          .forEach((f) => f.assignedTo && peopleSet.add(f.assignedTo));
        const people = Array.from(peopleSet).sort();
        writeTfsPeopleCache(conn, effectiveAreas, people);
        setPeopleFallbackStale(false);
      }
    } catch (err) {
      setTfsError(err instanceof Error ? err.message : "Error desconocido");
      setTfsLoadFailed(true);
      setSource("local");
    } finally {
      setLoading(false);
    }
  };

  // Scoped derivations — every UI consumer reads these instead of the raw
  // payload, guaranteeing that out-of-scope items never leak into listings,
  // KPIs, charts or the person selector. Effective scope = the user-configured
  // areas/iterations from Settings, falling back to the legacy Rodat defaults
  // when nothing has been picked.
  const isPathUnder = (path: string | undefined, root: string) =>
    Boolean(path && (path === root || path.startsWith(`${root}\\`)));

  const effectiveAreaPaths = useMemo(
    () => (configuredAreaPaths.length > 0 ? configuredAreaPaths : [RODAT_AREA_PATH]),
    [configuredAreaPaths],
  );
  const effectiveIterationPaths = useMemo(
    () => (configuredIterationPaths.length > 0 ? configuredIterationPaths : [RODAT_ITERATION_PATH]),
    [configuredIterationPaths],
  );

  const tfsFeatures = useMemo(
    () =>
      tfsFeaturesRaw.filter((f) =>
        effectiveAreaPaths.some((root) => isPathUnder(f.areaPath, root)),
      ),
    [tfsFeaturesRaw, effectiveAreaPaths],
  );
  const tfsTasks = useMemo(
    () =>
      tfsTasksRaw.filter(
        (t) =>
          effectiveAreaPaths.some((root) => isPathUnder(t.areaPath, root)) &&
          effectiveIterationPaths.some((root) => isPathUnder(t.iterationPath, root)),
      ),
    [tfsTasksRaw, effectiveAreaPaths, effectiveIterationPaths],
  );

  // Build unified data depending on source
  const { features, tasks } = useMemo<{ features: UnifiedFeature[]; tasks: UnifiedTask[] }>(() => {
    if (source === "tfs" && tfsFeatures.length + tfsTasks.length > 0) {
      const feats: UnifiedFeature[] = tfsFeatures.map((f) => {
        const childTasks = tfsTasks.filter((t) => t.areaPath && f.areaPath && t.areaPath === f.areaPath);
        return {
          id: String(f.id),
          title: f.title,
          state: f.state,
          assignee: f.assignedTo,
          taskCount: childTasks.length,
          doneCount: childTasks.filter((t) => normalizeState(t.state) === "done").length,
        };
      });
      const tks: UnifiedTask[] = tfsTasks.map((t) => ({
        id: String(t.id),
        title: t.title,
        state: t.state,
        type: t.workItemType,
        assignee: t.assignedTo,
      }));
      return { features: feats, tasks: tks };
    }

    // Local fallback: derive "features" from teams (each team = a feature group)
    // and tasks from workTopics.
    const feats: UnifiedFeature[] = teams.map((team) => {
      const teamMemberIds = members.filter((m) => m.teamId === team.id).map((m) => m.id);
      const teamTopics = workTopics.filter((t) => teamMemberIds.includes(t.memberId));
      return {
        id: team.id,
        title: `${team.name} — Backlog`,
        state: teamTopics.some((t) => t.status === "in-progress") ? "Active" : "Pending",
        taskCount: teamTopics.length,
        doneCount: teamTopics.filter((t) => t.status === "completed").length,
      };
    });
    // Also add per-member "mini features" based on biggest topic
    const tks: UnifiedTask[] = workTopics.map((t) => {
      const owner = members.find((m) => m.id === t.memberId);
      return {
        id: t.id,
        title: t.name,
        state: t.status,
        type: "Topic",
        assignee: owner?.name,
        featureId: owner?.teamId,
      };
    });
    return { features: feats, tasks: tks };
  }, [source, tfsFeatures, tfsTasks, teams, members, workTopics]);

  // Filter people by selected team tab (for the dropdown).
  //
  // Fallback: when the current TFS load failed and yielded an empty roster,
  // fall back to the last cached people list associated to the same
  // connection + area paths so the selector stays usable. A subtle warning
  // is surfaced via `peopleFallbackStale` so the user knows the list may be
  // outdated.
  const peopleForTab = useMemo(() => {
    if (source === "tfs") {
      const set = new Set<string>();
      tasks.forEach((t) => t.assignee && set.add(t.assignee));
      features.forEach((f) => f.assignee && set.add(f.assignee));
      if (set.size > 0) return Array.from(set).sort();

      // Empty live roster: try the cache if the last load failed.
      if (tfsConn && tfsLoadFailed) {
        const exact = peekTfsPeopleCache(tfsConn, lastAreaPaths);
        if (exact && exact.length > 0) return exact;
        const anyForConn = peekTfsPeopleCacheForConnection(tfsConn);
        if (anyForConn && anyForConn.length > 0) return anyForConn;
      }
      return [];
    }
    if (activeTeam === "all") return members.map((m) => m.name);
    return members.filter((m) => m.teamId === activeTeam).map((m) => m.name);
  }, [source, tasks, features, activeTeam, members, tfsConn, tfsLoadFailed, lastAreaPaths]);

  // Flip the "stale" flag whenever the selector is actually being populated
  // from the fallback cache rather than from fresh data.
  useEffect(() => {
    if (source !== "tfs") {
      if (peopleFallbackStale) setPeopleFallbackStale(false);
      return;
    }
    const liveHasPeople =
      tasks.some((t) => t.assignee) || features.some((f) => f.assignee);
    const usingFallback = tfsLoadFailed && !liveHasPeople && peopleForTab.length > 0;
    if (usingFallback !== peopleFallbackStale) setPeopleFallbackStale(usingFallback);
  }, [source, tfsLoadFailed, tasks, features, peopleForTab.length, peopleFallbackStale]);

  // Normalize invalid URL params (stale team/person IDs) back to "all".
  // Wait for data to be ready before invalidating, otherwise we'd wipe the
  // URL prematurely while TFS is still loading or local data is hydrating.
  useEffect(() => {
    if (loading) return;
    const dataReady = source === "tfs"
      ? tasks.length + features.length > 0
      : teams.length > 0 || members.length > 0;
    if (!dataReady) return;

    const invalidTeam =
      activeTeam !== "all" && source === "local" && !teams.some((t) => t.id === activeTeam);
    const invalidPerson =
      activePerson !== "all" && !peopleForTab.includes(activePerson);

    if (!invalidTeam && !invalidPerson) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (invalidTeam) {
          next.delete("team");
          next.delete("person");
        } else if (invalidPerson) {
          next.delete("person");
        }
        return next;
      },
      { replace: true },
    );
  }, [loading, source, teams, members, peopleForTab, activeTeam, activePerson, tasks.length, features.length, setSearchParams]);

  // Debounced prefetch of team area paths whenever the team filter changes in
  // TFS mode. The cache (TTL 10 min) makes this a no-op when the value is
  // already warm; otherwise it warms it in the background so the people
  // selector and any subsequent reload feel instant.
  //
  // Fallback: if the prefetch fails (network/CORS/timeout/HTTP error), we
  // keep the last known cached paths (if any) so the selector stays usable,
  // and we surface a subtle "usando caché" warning. The warning auto-clears
  // on the next successful prefetch.
  const [prefetching, setPrefetching] = useState(false);
  const [prefetchStaleWarning, setPrefetchStaleWarning] = useState(false);
  useEffect(() => {
    if (source !== "tfs" || !tfsConn?.team) return;
    const conn = tfsConn;
    const timer = window.setTimeout(() => {
      setPrefetching(true);
      listTfsTeamAreaPaths(conn)
        .then((res) => {
          if (res.error) {
            // Network/HTTP failure: fall back to last cache if available.
            const cached = peekTfsAreaPathCache(conn);
            setPrefetchStaleWarning(cached !== null);
          } else {
            // Fresh data arrived — clear any previous warning.
            setPrefetchStaleWarning(false);
          }
        })
        .catch(() => {
          const cached = peekTfsAreaPathCache(conn);
          setPrefetchStaleWarning(cached !== null);
        })
        .finally(() => setPrefetching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [source, tfsConn, activeTeam]);


  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // team filter (local mode only — TFS tasks don't have team mapping)
      if (source === "local" && activeTeam !== "all") {
        const owner = members.find((m) => m.name === t.assignee);
        if (owner?.teamId !== activeTeam) return false;
      }
      if (activePerson !== "all" && t.assignee !== activePerson) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, activeTeam, activePerson, search, source, members]);

  // Stats for visuals
  const stateDistribution = useMemo(() => {
    const counts: Record<string, number> = { active: 0, pending: 0, done: 0, blocked: 0 };
    filteredTasks.forEach((t) => {
      counts[normalizeState(t.state)]++;
    });
    return Object.entries(counts).map(([key, value]) => ({
      key, name: stateLabel[key], value, fill: stateColorVar[key],
    }));
  }, [filteredTasks]);

  const workloadByPerson = useMemo(() => {
    const map: Record<string, { active: number; pending: number; done: number; blocked: number }> = {};
    filteredTasks.forEach((t) => {
      const name = t.assignee || "Sin asignar";
      if (!map[name]) map[name] = { active: 0, pending: 0, done: 0, blocked: 0 };
      map[name][normalizeState(t.state)]++;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, total: v.active + v.pending + v.done + v.blocked }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [filteredTasks]);

  const filteredFeatures = useMemo(() => {
    if (source !== "local" || activeTeam === "all") return features;
    return features.filter((f) => f.id === activeTeam);
  }, [features, activeTeam, source]);

  // Scope validation — audits the raw TFS payload to confirm that every
  // Feature/Task lives under one of the configured area paths, and that
  // every Task's iteration is under one of the configured iteration paths.
  // Surfaced as a visible banner so users (and us) can verify the scope is
  // being enforced end-to-end.
  const scopeCheck = useMemo(() => {
    const featuresOutOfArea = tfsFeaturesRaw.filter(
      (f) => !effectiveAreaPaths.some((root) => isPathUnder(f.areaPath, root)),
    );
    const tasksOutOfArea = tfsTasksRaw.filter(
      (t) => !effectiveAreaPaths.some((root) => isPathUnder(t.areaPath, root)),
    );
    const tasksOutOfIteration = tfsTasksRaw.filter(
      (t) => !effectiveIterationPaths.some((root) => isPathUnder(t.iterationPath, root)),
    );
    return {
      featuresTotal: tfsFeatures.length,
      tasksTotal: tfsTasks.length,
      featuresRawTotal: tfsFeaturesRaw.length,
      tasksRawTotal: tfsTasksRaw.length,
      featuresOutOfArea,
      tasksOutOfArea,
      tasksOutOfIteration,
      ok:
        featuresOutOfArea.length === 0 &&
        tasksOutOfArea.length === 0 &&
        tasksOutOfIteration.length === 0,
    };
  }, [tfsFeaturesRaw, tfsTasksRaw, tfsFeatures.length, tfsTasks.length, effectiveAreaPaths, effectiveIterationPaths]);


  const copyWorkItemLink = async (id: string, type: "feature" | "tarea") => {
    if (!tfsBaseUrl) return;
    const url = `${tfsBaseUrl}/_workitems/edit/${id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success(`Enlace de la ${type} #${id} copiado`);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Features & Tareas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visión general del trabajo en curso del proyecto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            {source === "tfs" ? <Cloud className="h-3 w-3" /> : <Database className="h-3 w-3" />}
            <span className="text-xs">{source === "tfs" ? "Azure DevOps" : "Datos locales"}</span>
          </Badge>
          {/* Subtle prefetch indicator — fades in while warming the area-path cache */}
          <div
            aria-live="polite"
            aria-hidden={!prefetching}
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-200",
              prefetching ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Precargando áreas…</span>
          </div>
          {/* Fallback warning — shown when prefetch failed but we still have
              a cached set of area paths keeping the selector usable. */}
          {prefetchStaleWarning && !prefetching && (
            <Badge
              variant="outline"
              className="gap-1.5 border-status-vacation/40 text-status-vacation"
              title="No se pudo actualizar la lista de áreas del equipo. Se está usando la última versión en caché."
              aria-live="polite"
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">Usando caché</span>
            </Badge>
          )}
          {tfsConnConfigured && (
            <Button size="sm" variant="outline" onClick={() => loadFromTfs(undefined, { forceAreaRefresh: true })} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Actualizar</span>
            </Button>
          )}
        </div>
      </div>

      {tfsError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{tfsError}</CardContent>
        </Card>
      )}

      {/* Effective scope summary — shows exactly which areas/iterations are
          being applied to the queries and whether they come from the user's
          Settings or from the legacy Rodat defaults. Helps users confirm at
          a glance what is being filtered before reading the audit banner. */}
      {source === "tfs" && (
        <Card className="border bg-muted/30">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                  Alcance efectivo
                </CardTitle>
                <CardDescription className="text-xs">
                  Filtros aplicados a las consultas de Features y Tareas. Cámbialos en Ajustes › Azure DevOps.
                </CardDescription>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
              >
                <Link to="/settings/azure-devops">
                  <SettingsIcon className="h-3.5 w-3.5" aria-hidden />
                  Cambiar en Ajustes
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Legend — clarifies the meaning of the small tags rendered
                next to each path so users can interpret them at a glance. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border bg-background/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Leyenda:</span>
              <span className="inline-flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[11px]">
                  ejemplo\path
                </Badge>
                <span className="text-[10px] text-foreground/70">configurado</span>
                <span>= elegido por ti en Ajustes › Azure DevOps</span>
              </span>
              <span className="text-border" aria-hidden>•</span>
              <span className="inline-flex items-center gap-1.5">
                <Badge variant="outline" className="font-mono text-[11px]">
                  ejemplo\path
                </Badge>
                <span className="text-[10px] italic text-muted-foreground">default RODAT</span>
                <span>= valor por defecto del equipo (SDES\Rodat / SDES\Rodat\4.4)</span>
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground min-w-[8rem]">
                  Áreas (Features y Tareas)
                </span>
                <Badge
                  variant={configuredAreaPaths.length > 0 ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {configuredAreaPaths.length > 0
                    ? `Configurado (${configuredAreaPaths.length})`
                    : "Por defecto"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 pl-1">
                {effectiveAreaPaths.map((p) => {
                  const isConfigured = configuredAreaPaths.includes(p);
                  return (
                    <span
                      key={`scope-area-${p}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {p}
                      </Badge>
                      <span
                        className={cn(
                          "text-[10px]",
                          isConfigured ? "text-foreground/70" : "text-muted-foreground italic",
                        )}
                      >
                        {isConfigured ? "configurado" : "default RODAT"}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground min-w-[8rem]">
                  Iteraciones (Tareas)
                </span>
                <Badge
                  variant={configuredIterationPaths.length > 0 ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {configuredIterationPaths.length > 0
                    ? `Configurado (${configuredIterationPaths.length})`
                    : "Por defecto"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 pl-1">
                {effectiveIterationPaths.map((p) => {
                  const isConfigured = configuredIterationPaths.includes(p);
                  return (
                    <span
                      key={`scope-iter-${p}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {p}
                      </Badge>
                      <span
                        className={cn(
                          "text-[10px]",
                          isConfigured ? "text-foreground/70" : "text-muted-foreground italic",
                        )}
                      >
                        {isConfigured ? "configurado" : "default RODAT"}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            {/* Impact summary — counts of items returned by the current
                scope so the user can quickly gauge how restrictive their
                area/iteration selection is. Excluded counts surface only
                when TFS returned items outside the scope. */}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground">
                Resultado con este alcance
              </span>
              <Badge variant="secondary" className="gap-1.5">
                <Layers className="h-3 w-3" aria-hidden />
                {scopeCheck.featuresTotal} {scopeCheck.featuresTotal === 1 ? "feature" : "features"}
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <ListChecks className="h-3 w-3" aria-hidden />
                {scopeCheck.tasksTotal} {scopeCheck.tasksTotal === 1 ? "tarea" : "tareas"}
              </Badge>
              {!scopeCheck.ok && (
                <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                  <EyeOff className="h-3 w-3" aria-hidden />
                  {scopeCheck.featuresRawTotal - scopeCheck.featuresTotal +
                    (scopeCheck.tasksRawTotal - scopeCheck.tasksTotal)}{" "}
                  excluido{
                    scopeCheck.featuresRawTotal -
                      scopeCheck.featuresTotal +
                      (scopeCheck.tasksRawTotal - scopeCheck.tasksTotal) ===
                    1
                      ? ""
                      : "s"
                  }
                </Badge>
              )}
              {loading && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Actualizando…
                </span>
              )}
            </div>
            {configuredAreaPaths.length === 0 && configuredIterationPaths.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No hay alcance personalizado en Ajustes; se usan los valores por defecto del equipo RODAT.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scope validation banner — confirms that Features and Tasks are
          restricted to SDES\Rodat, and Tasks additionally to iterations
          under SDES\Rodat\4.4. Only meaningful for the TFS source. */}
      {source === "tfs" && (
        <Card
          className={cn(
            "border",
            scopeCheck.ok
              ? "border-status-work/40 bg-status-work/5"
              : "border-status-vacation/40 bg-status-vacation/5",
          )}
          aria-live="polite"
        >
          <CardContent className="py-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="mt-0.5">
                {scopeCheck.ok ? (
                  <ShieldCheck className="h-5 w-5 text-status-work" aria-hidden />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-status-vacation" aria-hidden />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {scopeCheck.ok
                      ? "Alcance verificado"
                      : "Elementos fuera del alcance ocultos automáticamente"}
                  </p>
                  {effectiveAreaPaths.map((p) => (
                    <Badge key={`area-${p}`} variant="outline" className="gap-1 font-mono text-[11px]">
                      Área: {p}
                    </Badge>
                  ))}
                  {effectiveIterationPaths.map((p) => (
                    <Badge key={`iter-${p}`} variant="outline" className="gap-1 font-mono text-[11px]">
                      Iteración (tareas): {p}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {scopeCheck.ok ? (
                    <>
                      {scopeCheck.featuresTotal} features y {scopeCheck.tasksTotal} tareas cargadas, todas dentro del alcance.
                    </>
                  ) : (
                    <>
                      Mostrando {scopeCheck.featuresTotal} de {scopeCheck.featuresRawTotal} features
                      {" "}y {scopeCheck.tasksTotal} de {scopeCheck.tasksRawTotal} tareas.
                      {" "}Excluidas: {scopeCheck.featuresOutOfArea.length} features fuera del área,
                      {" "}{scopeCheck.tasksOutOfArea.length} tareas fuera del área,
                      {" "}{scopeCheck.tasksOutOfIteration.length} tareas fuera de la iteración.
                    </>
                  )}
                </p>
                {!scopeCheck.ok && (
                  <Collapsible
                    className="mt-2"
                    open={auditState.open}
                    onOpenChange={setAuditOpen}
                  >
                    <CollapsibleTrigger
                      className={cn(
                        "group flex items-center gap-1.5 text-xs font-medium",
                        "text-status-vacation hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded",
                      )}
                      aria-label="Mostrar detalle de elementos ocultos"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Ver auditoría de elementos ocultos
                      {" "}
                      ({scopeCheck.featuresOutOfArea.length +
                        scopeCheck.tasksOutOfArea.length +
                        scopeCheck.tasksOutOfIteration.length})
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3">
                      <div className="rounded-md border border-border/60 bg-background/60 divide-y divide-border/60 max-h-72 overflow-auto">
                        {([
                          {
                            key: "features-area",
                            groupKey: "featuresArea" as const,
                            icon: <MapPinOff className="h-3.5 w-3.5" />,
                            label: `Features fuera del área (${scopeCheck.featuresOutOfArea.length})`,
                            reason: `Esperado bajo ${effectiveAreaPaths.join(" o ")}`,
                            items: scopeCheck.featuresOutOfArea.map((f) => ({
                              id: f.id,
                              type: "Feature" as const,
                              title: f.title,
                              detailLabel: "Área",
                              detailValue: f.areaPath ?? "(sin área)",
                            })),
                          },
                          {
                            key: "tasks-area",
                            groupKey: "tasksArea" as const,
                            icon: <MapPinOff className="h-3.5 w-3.5" />,
                            label: `Tareas fuera del área (${scopeCheck.tasksOutOfArea.length})`,
                            reason: `Esperado bajo ${effectiveAreaPaths.join(" o ")}`,
                            items: scopeCheck.tasksOutOfArea.map((t) => ({
                              id: t.id,
                              type: "Tarea" as const,
                              title: t.title,
                              detailLabel: "Área",
                              detailValue: t.areaPath ?? "(sin área)",
                            })),
                          },
                          {
                            key: "tasks-iteration",
                            groupKey: "tasksIteration" as const,
                            icon: <CalendarOff className="h-3.5 w-3.5" />,
                            label: `Tareas fuera de la iteración (${scopeCheck.tasksOutOfIteration.length})`,
                            reason: `Esperado bajo ${effectiveIterationPaths.join(" o ")}`,
                            items: scopeCheck.tasksOutOfIteration.map((t) => ({
                              id: t.id,
                              type: "Tarea" as const,
                              title: t.title,
                              detailLabel: "Iteración",
                              detailValue: t.iterationPath ?? "(sin iteración)",
                            })),
                          },
                        ])
                          .filter((g) => g.items.length > 0)
                          .map((group) => (
                            <Collapsible
                              key={group.key}
                              className="p-3"
                              open={auditState.groups[group.groupKey]}
                              onOpenChange={(open) => setGroupOpen(group.groupKey, open)}
                            >
                              <CollapsibleTrigger
                                className={cn(
                                  "group/inner flex w-full items-center gap-1.5 text-xs font-medium text-foreground",
                                  "hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded text-left",
                                )}
                              >
                                {group.icon}
                                <span>{group.label}</span>
                                <span className="text-muted-foreground font-normal">
                                  · {group.reason}
                                </span>
                                <ChevronDown className="h-3.5 w-3.5 ml-auto transition-transform group-data-[state=open]/inner:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2">
                                <ul className="space-y-1">
                                  {group.items.map((it) => (
                                    <li
                                      key={`${group.key}-${it.id}`}
                                      className="flex items-start gap-2 text-xs"
                                    >
                                      <Badge
                                        variant="outline"
                                        className="shrink-0 font-mono text-[10px] px-1.5 py-0"
                                      >
                                        {it.type} #{it.id}
                                      </Badge>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-foreground" title={it.title}>
                                          {it.title || "(sin título)"}
                                        </p>
                                        <p
                                          className="truncate font-mono text-[11px] text-muted-foreground"
                                          title={`${it.detailLabel}: ${it.detailValue}`}
                                        >
                                          {it.detailLabel}: {it.detailValue}
                                        </p>
                                      </div>
                                      {tfsBaseUrl && (
                                        <a
                                          href={`${tfsBaseUrl}/_workitems/edit/${it.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
                                          aria-label={`Abrir ${it.type} ${it.id} en Azure DevOps`}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Abrir
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* KPI strip */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/50">
                <Layers className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{features.length}</p>
                <p className="text-xs text-muted-foreground">Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/50">
                <ListChecks className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tasks.length}</p>
                <p className="text-xs text-muted-foreground">Tareas totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.active}20` }}>
                <Loader2 className="h-4 w-4" style={{ color: stateColorVar.active }} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tasks.filter((t) => normalizeState(t.state) === "active").length}
                </p>
                <p className="text-xs text-muted-foreground">En ejecución</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.done}20` }}>
                <ListChecks className="h-4 w-4" style={{ color: stateColorVar.done }} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tasks.filter((t) => normalizeState(t.state) === "done").length}
                </p>
                <p className="text-xs text-muted-foreground">Completadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-4 w-4" /> Features del proyecto
          </CardTitle>
          <CardDescription>Progreso por feature con tareas asociadas</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredFeatures.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay features para mostrar.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFeatures.map((f) => {
                const norm = normalizeState(f.state);
                const pct = f.taskCount > 0 ? Math.round((f.doneCount / f.taskCount) * 100) : 0;
                return (
                  <div key={f.id} className="border border-border rounded-lg p-4 hover:border-primary/40 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">{f.title}</h3>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                        style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
                      >
                        {stateLabel[norm]}
                      </Badge>
                    </div>
                    {f.assignee && (
                      <p className="text-xs text-muted-foreground mb-3 truncate">👤 {f.assignee}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{f.doneCount} / {f.taskCount} tareas</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    {source === "tfs" && tfsBaseUrl && (
                      <div className="mt-3 flex items-center gap-1.5">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs flex-1 justify-center"
                        >
                          <a
                            href={`${tfsBaseUrl}/_workitems/edit/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir feature ${f.id} en Azure DevOps`}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Abrir en Azure DevOps
                          </a>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          title="Copiar enlace"
                          aria-label={`Copiar enlace de la feature ${f.id}`}
                          onClick={() => copyWorkItemLink(f.id, "feature")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual: what's running right now */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución por estado</CardTitle>
            <CardDescription>Qué se está ejecutando ahora mismo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stateDistribution.filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {stateDistribution.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Carga por persona
            </CardTitle>
            <CardDescription>Top {workloadByPerson.length} con más tareas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={workloadByPerson} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="active" stackId="a" fill={stateColorVar.active} name="Activo" />
                <Bar dataKey="pending" stackId="a" fill={stateColorVar.pending} name="Pendiente" />
                <Bar dataKey="blocked" stackId="a" fill={stateColorVar.blocked} name="Bloqueado" />
                <Bar dataKey="done" stackId="a" fill={stateColorVar.done} name="Hecho" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tasks section: tabs por equipo + dropdown persona */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Tareas asignadas
              </CardTitle>
              <CardDescription>
                {filteredTasks.length} de {tasks.length} tareas mostradas
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={manualApply ? draftSearch : search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tarea..."
                  className="pl-8 h-9 w-56"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <PersonCombobox
                  value={manualApply ? draftPerson : activePerson}
                  onChange={setActivePerson}
                  people={peopleForTab}
                />
                {peopleFallbackStale && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-status-vacation/40 text-status-vacation"
                    title="No se pudo actualizar la lista de personas. Se está mostrando el último listado en caché."
                    aria-live="polite"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-[10px]">Caché</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {/* Confirmar cambios: holds filter edits in a draft until applied */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <Switch
                id="manual-apply"
                checked={manualApply}
                onCheckedChange={(checked) => {
                  setManualApply(checked);
                  // When turning on, seed drafts from current applied values.
                  if (checked) {
                    setDraftTeam(activeTeam);
                    setDraftPerson(activePerson);
                    setDraftSearch(search);
                  }
                }}
              />
              <Label htmlFor="manual-apply" className="text-xs text-muted-foreground cursor-pointer">
                Confirmar cambios antes de aplicar
              </Label>
              {hasPendingChanges && (
                <Badge variant="secondary" className="text-[10px]">Cambios sin aplicar</Badge>
              )}
            </div>
            {manualApply && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={discardDraft}
                  disabled={!hasPendingChanges}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Descartar</span>
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={applyDraft}
                  disabled={!hasPendingChanges}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Aplicar</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={manualApply ? draftTeam : activeTeam} onValueChange={setActiveTeam}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              {teams.map((team) => (
                <TabsTrigger key={team.id} value={team.id}>{team.name}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeTeam} className="mt-4">
              {filteredTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No hay tareas que coincidan con los filtros.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">#</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead className="w-[100px]">Tipo</TableHead>
                        <TableHead className="w-[120px]">Estado</TableHead>
                        <TableHead className="w-[180px]">Asignado a</TableHead>
                        {source === "tfs" && tfsBaseUrl && (
                          <TableHead className="w-[90px] text-right">Acciones</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.slice(0, 100).map((t) => {
                        const norm = normalizeState(t.state);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                            <TableCell className="font-medium text-sm">{t.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                                style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColorVar[norm] }} />
                                {t.state}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {t.assignee || <span className="text-muted-foreground italic">Sin asignar</span>}
                            </TableCell>
                            {source === "tfs" && tfsBaseUrl && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button
                                    asChild
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title="Abrir en Azure DevOps"
                                  >
                                    <a
                                      href={`${tfsBaseUrl}/_workitems/edit/${t.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`Abrir tarea ${t.id} en Azure DevOps`}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title="Copiar enlace"
                                    aria-label={`Copiar enlace de la tarea ${t.id}`}
                                    onClick={() => copyWorkItemLink(t.id, "tarea")}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {filteredTasks.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t">
                      Mostrando 100 de {filteredTasks.length} tareas — afina los filtros para ver más.
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable person picker — replaces the plain <Select> so users can quickly
// type a name to filter, see a count of matching people, and clear the
// selection with a single click.
// ---------------------------------------------------------------------------
interface PersonComboboxProps {
  value: string;
  onChange: (next: string) => void;
  people: string[];
}

function PersonCombobox({ value, onChange, people }: PersonComboboxProps) {
  const [open, setOpen] = useState(false);
  const isAll = value === "all";
  const label = isAll ? `Todas las personas (${people.length})` : value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-60 justify-between font-normal"
        >
          <span className={cn("truncate", isAll && "text-muted-foreground")}>{label}</span>
          <div className="flex items-center gap-1 shrink-0">
            {!isAll && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("all");
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar persona..." />
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", isAll ? "opacity-100" : "opacity-0")} />
                Todas las personas
              </CommandItem>
              {people.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
