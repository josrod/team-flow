import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
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
import { TaskHandoverNotes } from "@/components/TaskHandoverNotes";
import { HandoverSummaryDialog } from "@/components/HandoverSummaryDialog";
import { MessageSquarePlus, ChevronUp, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { listTfsFeatures, listTfsTasks, listTfsTeamAreaPaths, peekTfsAreaPathCache, peekTfsPeopleCache, peekTfsPeopleCacheForConnection, writeTfsPeopleCache, RODAT_AREA_PATH, RODAT_ITERATION_PATH, type TfsConnection, type TfsWorkItem } from "@/services/tfs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { assignTasksToFeatures } from "@/lib/featureAssignment";
import { toast } from "sonner";
import { useSearchParams, Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { WorkloadMatrix } from "@/components/WorkloadMatrix";
import { TaskTypeFilter } from "@/components/TaskTypeFilter";
import { computeAvailableTaskTypes, isExcludedTaskType } from "@/lib/taskTypeFilter";
import { useTaskPriorities } from "@/hooks/use-task-priorities";
import { PriorityLevel, sortByPriority } from "@/lib/taskPriority";
import { PrioritySelect } from "@/components/PrioritySelect";
import { PriorityMenu } from "@/components/PriorityMenu";
import { SortableRows } from "@/components/SortableRows";

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
  iterationPath?: string;
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

interface FeaturesPageProps {
  view?: "all" | "features" | "tasks" | "workload";
}

export default function FeaturesPage({ view = "all" }: FeaturesPageProps = {}) {
  const { t } = useLang();
  const showFeatures = view === "all" || view === "features";
  const showTasks = view === "all" || view === "tasks";
  const showWorkload = view === "workload";
  const pageTitle = view === "workload" ? t.workload : view === "tasks" ? t.tasks : view === "features" ? t.features : t.featuresAndTasks;
  
  const [showAllWorkloadTasks, setShowAllWorkloadTasks] = useState(false);
  const pageSubtitle =
    view === "workload"
      ? showAllWorkloadTasks ? t.workloadSubtitleAll : t.workloadSubtitle
      : view === "tasks"
      ? t.tasksSubtitle
      : view === "features"
      ? t.featuresSubtitle
      : t.generalOverview;
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

  // Debounced version of `search` used for filtering and for the empty-state
  // message. This keeps the visible result list and the empty message perfectly
  // in sync — both reflect the same (slightly delayed) query the user typed —
  // and avoids re-filtering on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(handle);
  }, [search]);

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
  const [showFlatList, setShowFlatList] = useState(false);
  const [handoverPerson, setHandoverPerson] = useState<string | null>(null);
  type TaskStateKey = "active" | "pending" | "blocked" | "done";
  type TaskSortKey = "total-desc" | "total-asc" | "name-asc" | "name-desc" | "priority";
  const [stateFilter, setStateFilter] = useState<Set<TaskStateKey>>(
    () => new Set<TaskStateKey>(["active", "pending"]),
  );
  // Type filter: empty set means "show all types".
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set<string>());
  const TASK_SORT_STORAGE_KEY = "rosen.taskSort.v1";
  const isTaskSortKey = (v: unknown): v is TaskSortKey =>
    v === "total-desc" || v === "total-asc" || v === "name-asc" || v === "name-desc" || v === "priority";
  const [taskSort, setTaskSort] = useState<TaskSortKey>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(TASK_SORT_STORAGE_KEY) : null;
      return isTaskSortKey(stored) ? stored : "total-desc";
    } catch {
      return "total-desc";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_SORT_STORAGE_KEY, taskSort);
    } catch {
      // Ignore storage errors (private mode, quota, etc.).
    }
  }, [taskSort]);
  const toggleStateFilter = (key: TaskStateKey) => {
    setStateFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const toggleTypeFilter = (key: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Personal priority (local-only, per browser). Used to rank tasks/bugs
  // independently of TFS state and to allow drag & drop reordering inside the
  // flat list view.
  const taskPriorities = useTaskPriorities();
  const priorityLevelFor = (id: string): PriorityLevel =>
    taskPriorities.priorities[id]?.level ?? "medium";




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
        setTfsError(t.errIncompleteAdoConfig);
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
        const people = Array.from(peopleSet).sort((a, b) => a.localeCompare(b));
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
      // Pure helper guarantees: sum(feature.taskCount) === tfsTasks.length.
      const feats: UnifiedFeature[] = assignTasksToFeatures(tfsFeatures, tfsTasks);
      const tks: UnifiedTask[] = tfsTasks.map((t) => ({
        id: String(t.id),
        title: t.title,
        state: t.state,
        type: t.workItemType,
        assignee: t.assignedTo,
        iterationPath: t.iterationPath,
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
      if (set.size > 0) return Array.from(set).sort((a, b) => a.localeCompare(b));

      // Empty live roster: try the cache if the last load failed.
      if (tfsConn && tfsLoadFailed) {
        const exact = peekTfsPeopleCache(tfsConn, lastAreaPaths);
        if (exact && exact.length > 0) return exact;
        const anyForConn = peekTfsPeopleCacheForConnection(tfsConn);
        if (anyForConn && anyForConn.length > 0) return anyForConn;
      }
      return [];
    }
    if (activeTeam === "all") return members.map((m) => m.name).sort((a, b) => a.localeCompare(b));
    return members.filter((m) => m.teamId === activeTeam).map((m) => m.name).sort((a, b) => a.localeCompare(b));
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


  // Precomputed lookup: assignee name → teamId. O(1) lookups inside filteredTasks.
  const teamIdByAssignee = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.name, m.teamId));
    return map;
  }, [members]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const searchLower = debouncedSearch ? debouncedSearch.toLowerCase() : "";
    return tasks.filter((t) => {
      // Team filter — map assignee name → teamId in both local and TFS modes
      if (activeTeam !== "all") {
        if (teamIdByAssignee.get(t.assignee) !== activeTeam) return false;
      }
      if (activePerson !== "all" && t.assignee !== activePerson) return false;
      if (searchLower && !t.title.toLowerCase().includes(searchLower)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(t.type)) return false;
      // View-aware exclusion (e.g. Product Backlog Item is hidden in Tasks).
      if (isExcludedTaskType(t.type, view)) return false;
      return true;
    });
  }, [tasks, activeTeam, activePerson, debouncedSearch, teamIdByAssignee, typeFilter, view]);

  // Distinct task types present in the current dataset (pre type-filter), so
  // the chips remain visible even after the user narrows the selection.
  const availableTypes = useMemo(
    () => computeAvailableTaskTypes(tasks, view),
    [tasks, view],
  );

  // Task counts per type for the type-filter chips, applying all filters
  // except the type filter itself so the counts reflect the current scope.
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const searchLower = debouncedSearch ? debouncedSearch.toLowerCase() : "";
    tasks.forEach((t) => {
      if (isExcludedTaskType(t.type, view)) return;
      if (activeTeam !== "all" && teamIdByAssignee.get(t.assignee) !== activeTeam) return;
      if (activePerson !== "all" && t.assignee !== activePerson) return;
      if (searchLower && !t.title.toLowerCase().includes(searchLower)) return;
      if (stateFilter.size > 0 && !stateFilter.has(normalizeState(t.state))) return;
      counts[t.type] = (counts[t.type] || 0) + 1;
    });
    return counts;
  }, [tasks, activeTeam, activePerson, debouncedSearch, teamIdByAssignee, stateFilter, view]);


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
    filteredTasks.forEach((task) => {
      const name = task.assignee || t.unassigned;
      if (!map[name]) map[name] = { active: 0, pending: 0, done: 0, blocked: 0 };
      map[name][normalizeState(task.state)]++;
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

  // Aggregated stats per section
  const featureStats = useMemo(() => {
    const total = filteredFeatures.length;
    const active = filteredFeatures.filter((f) => normalizeState(f.state) === "active").length;
    const done = filteredFeatures.filter((f) => normalizeState(f.state) === "done").length;
    const totalTasks = filteredFeatures.reduce((acc, f) => acc + f.taskCount, 0);
    const doneTasks = filteredFeatures.reduce((acc, f) => acc + f.doneCount, 0);
    const avgProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    return { total, active, done, avgProgress };
  }, [filteredFeatures]);

  const taskStats = useMemo(() => {
    const counts = { active: 0, pending: 0, done: 0, blocked: 0 };
    filteredTasks.forEach((t) => {
      counts[normalizeState(t.state)]++;
    });
    return { total: filteredTasks.length, ...counts };
  }, [filteredTasks]);

  // Group filtered tasks by assignee, keeping only open/in-progress items.
  // Sorted by total desc; "Sin asignar" pushed to the end.
  const tasksByPerson = useMemo(() => {
    const map = new Map<string, { active: UnifiedTask[]; pending: UnifiedTask[]; blocked: UnifiedTask[]; done: UnifiedTask[] }>();
    filteredTasks.forEach((task) => {
      const norm = normalizeState(task.state);
      if (!stateFilter.has(norm)) return;
      const key = task.assignee || t.unassigned;
      if (!map.has(key)) map.set(key, { active: [], pending: [], blocked: [], done: [] });
      map.get(key)![norm].push(task);
    });
    const arr = Array.from(map.entries()).map(([person, v]) => ({
      person,
      ...v,
      total: v.active.length + v.pending.length + v.blocked.length + v.done.length,
    }));
    arr.sort((a, b) => {
      if (a.person === t.unassigned) return 1;
      if (b.person === t.unassigned) return -1;
      switch (taskSort) {
        case "total-asc": return a.total - b.total;
        case "name-asc": return a.person.localeCompare(b.person);
        case "name-desc": return b.person.localeCompare(a.person);
        case "total-desc":
        default: return b.total - a.total;
      }
    });
    return arr;
  }, [filteredTasks, stateFilter, taskSort]);

  const defaultOpenPeople = useMemo(
    () => tasksByPerson.filter((p) => p.active.length > 0).map((p) => p.person),
    [tasksByPerson],
  );

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
      toast.success(t.linkCopied.replace("{type}", type).replace("{id}", id));
    } catch {
      toast.error(t.linkCopyFailed);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pageSubtitle}
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
            <span>{t.preloadingAreas}</span>
          </div>
          {/* Fallback warning — shown when prefetch failed but we still have
              a cached set of area paths keeping the selector usable. */}
          {prefetchStaleWarning && !prefetching && (
            <Badge
              variant="outline"
              className="gap-1.5 border-status-vacation/40 text-status-vacation"
              title={t.errTeamAreasUpdate}
              aria-live="polite"
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">{t.usingCache}</span>
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

      {/* Effective scope summary and verification banner moved to
          Settings › Azure DevOps to keep Features/Tasks/Workload focused
          on the data itself. */}



      {/* ============================================================ */}
      {/* SECTION 1 — Features                                          */}
      {/* ============================================================ */}
      {showFeatures && (
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3 border-b border-border/60 pb-2">
          <div>
            <h2 className="text-xl font-display font-semibold tracking-tight flex items-center gap-2">
              <Layers className="h-5 w-5 text-muted-foreground" /> Features
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Iniciativas del proyecto y su progreso global.
            </p>
          </div>
        </div>

        {/* Feature stats */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/50">
                  <Layers className="h-4 w-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{featureStats.total}</p>
                  <p className="text-xs text-muted-foreground">{t.features}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.active}20` }}>
                  <PlayCircle className="h-4 w-4" style={{ color: stateColorVar.active }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{featureStats.active}</p>
                  <p className="text-xs text-muted-foreground">Activas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.done}20` }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: stateColorVar.done }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{featureStats.done}</p>
                  <p className="text-xs text-muted-foreground">Completadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CircleDashed className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{featureStats.avgProgress}%</p>
                  <p className="text-xs text-muted-foreground">Avance medio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-4 w-4" /> {t.projectFeatures}
            </CardTitle>
            <CardDescription>{t.featureProgress}</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t.noFeaturesToShow}</p>
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
                            aria-label={t.copyLinkFeature.replace("{id}", f.id)}
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
      </section>
      )}

      {/* ============================================================ */}
      {/* SECTION 2 — Tareas                                            */}
      {/* ============================================================ */}
      {showTasks && (
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3 border-b border-border/60 pb-2">
          <div>
            <h2 className="text-xl font-display font-semibold tracking-tight flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-muted-foreground" /> Tareas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.workDistribution}
            </p>
          </div>
        </div>

        {/* Task stats */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/50">
                  <ListChecks className="h-4 w-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.pending}20` }}>
                  <CircleDashed className="h-4 w-4" style={{ color: stateColorVar.pending }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.pending}</p>
                  <p className="text-xs text-muted-foreground">{t.openTasks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.active}20` }}>
                  <PlayCircle className="h-4 w-4" style={{ color: stateColorVar.active }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.active}</p>
                  <p className="text-xs text-muted-foreground">{t.inProgress}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.blocked}20` }}>
                  <AlertOctagon className="h-4 w-4" style={{ color: stateColorVar.blocked }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.blocked}</p>
                  <p className="text-xs text-muted-foreground">{t.blockedTasks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: `${stateColorVar.done}20` }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: stateColorVar.done }} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.done}</p>
                  <p className="text-xs text-muted-foreground">{t.completedTasks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.statusDistribution}</CardTitle>
              <CardDescription>{t.statusDistributionDesc}</CardDescription>
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
                <UsersIcon className="h-4 w-4" /> {t.loadPerPerson}
              </CardTitle>
              <CardDescription>{t.topTasks.replace('{count}', String(workloadByPerson.length))}</CardDescription>
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
                  <Bar dataKey="active" stackId="a" fill={stateColorVar.active} name={t.chartActive} />
                  <Bar dataKey="pending" stackId="a" fill={stateColorVar.pending} name={t.chipPending} />
                  <Bar dataKey="blocked" stackId="a" fill={stateColorVar.blocked} name={t.chipBlocked} />
                  <Bar dataKey="done" stackId="a" fill={stateColorVar.done} name={t.chartDone} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Filters + tasks per person accordion */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" /> {t.tasksPerPerson}
                </CardTitle>
                <CardDescription>
                  {tasksByPerson.length === 1 ? t.personCount.replace("{count}", String(tasksByPerson.length)) : t.personsCount.replace("{count}", String(tasksByPerson.length))} · {t.filtering} {Array.from(stateFilter).map((k) => k === "active" ? t.inProgressPlural : k === "pending" ? t.pendingPlural : k === "blocked" ? t.blockedPlural : t.completedPlural).join(", ")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={manualApply ? draftSearch : search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.searchTaskPlaceholder}
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
                      title={t.errPeopleUpdate}
                      aria-live="polite"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-[10px]">{t.cache}</span>
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.filterByStateAria}>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">{t.stateColumn}</span>
                {(["active", "pending", "blocked", "done"] as const).map((key) => {
                  const active = stateFilter.has(key);
                  const color = stateColorVar[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleStateFilter(key)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        active
                          ? "border-transparent text-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-muted/40",
                      )}
                      style={active ? { background: `${color}25`, color } : undefined}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {key === "active" ? t.chipInProgress : key === "pending" ? t.chipPending : key === "blocked" ? t.chipBlocked : t.chipCompleted}
                    </button>
                  );
                })}
              </div>
              <TaskTypeFilter
                types={availableTypes}
                selected={typeFilter}
                counts={typeCounts}
                onToggle={toggleTypeFilter}
                onClear={() => setTypeFilter(new Set())}
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="task-sort" className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.sortBy}</Label>
                <select
                  id="task-sort"
                  value={taskSort}
                  onChange={(e) => setTaskSort(e.target.value as typeof taskSort)}
                  className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                >
                  <option value="total-desc">{t.moreTasks}</option>
                  <option value="total-asc">{t.fewerTasks}</option>
                  <option value="name-asc">{t.nameAZ}</option>
                  <option value="name-desc">{t.nameZA}</option>
                  <option value="priority">{t.personalPriority}</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="manual-apply"
                  checked={manualApply}
                  onCheckedChange={(checked) => {
                    setManualApply(checked);
                    if (checked) {
                      setDraftTeam(activeTeam);
                      setDraftPerson(activePerson);
                      setDraftSearch(search);
                    }
                  }}
                />
                <Label htmlFor="manual-apply" className="text-xs text-muted-foreground cursor-pointer">
                  {t.confirmChangesBeforeApply}
                </Label>
                {hasPendingChanges && (
                  <Badge variant="secondary" className="text-[10px]">{t.unappliedChanges}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {manualApply && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={discardDraft}
                      disabled={!hasPendingChanges}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span className="ml-1.5">{t.discard}</span>
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={applyDraft}
                      disabled={!hasPendingChanges}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span className="ml-1.5">{t.apply}</span>
                    </Button>
                  </>
                )}
                <PriorityMenu
                  onExport={taskPriorities.exportJson}
                  onImport={taskPriorities.importJson}
                  onReset={taskPriorities.reset}
                  count={Object.keys(taskPriorities.priorities).length}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setShowFlatList((v) => !v)}
                >
                  {showFlatList ? t.viewByPerson : t.viewFlatList}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={manualApply ? draftTeam : activeTeam} onValueChange={setActiveTeam}>
              <div className="flex flex-wrap items-center gap-2">
                <TabsList>
                  <TabsTrigger value="all">{t.all}</TabsTrigger>
                  {teams.map((team) => (
                    <TabsTrigger key={team.id} value={team.id}>{team.name}</TabsTrigger>
                  ))}
                </TabsList>
                {(() => {
                  const effectiveTeam = manualApply ? draftTeam : activeTeam;
                  if (effectiveTeam === "all") return null;
                  const teamName = teams.find((tm) => tm.id === effectiveTeam)?.name ?? effectiveTeam;
                  return (
                    <Badge
                      variant="secondary"
                      className="gap-1 pl-2 pr-1 py-1"
                      aria-label={t.activeTeamAria.replace("{team}", teamName)}
                    >
                      <span className="text-xs font-medium">{t.teamLabel}: {teamName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 hover:bg-transparent"
                        onClick={() => setActiveTeam("all")}
                        aria-label={t.removeTeamFilterAria.replace("{team}", teamName)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  );
                })()}
              </div>


              <TabsContent value={activeTeam} className="mt-4">
                {showFlatList ? (
                  filteredTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No hay tareas que coincidan con los filtros.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {taskSort === "priority" && <TableHead className="w-[36px]"><span className="sr-only">Reordenar</span></TableHead>}
                            <TableHead className="w-[60px]">#</TableHead>
                            <TableHead>{t.title}</TableHead>
                            <TableHead className="w-[100px]">Tipo</TableHead>
                            <TableHead className="w-[120px]">Estado</TableHead>
                            <TableHead className="w-[180px]">Iteración</TableHead>
                            <TableHead className="w-[140px]">Prioridad</TableHead>
                            <TableHead className="w-[180px]">Asignado a</TableHead>
                            {source === "tfs" && tfsBaseUrl && (
                              <TableHead className="w-[90px] text-right">Acciones</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const visible = (taskSort === "priority"
                              ? sortByPriority(filteredTasks, taskPriorities.priorities)
                              : filteredTasks
                            ).slice(0, 100);
                            return (
                              <SortableRows
                                items={visible}
                                enabled={taskSort === "priority"}
                                onReorder={(activeId, overId) => {
                                  const overEntry = taskPriorities.priorities[overId];
                                  const targetLevel: PriorityLevel = overEntry?.level ?? "medium";
                                  // Compute the over index inside the target level
                                  // among the currently visible items.
                                  const inLevel = visible.filter((it) => priorityLevelFor(it.id) === targetLevel);
                                  const overIndex = inLevel.findIndex((it) => it.id === overId);
                                  taskPriorities.move(activeId, targetLevel, Math.max(0, overIndex));
                                }}
                                renderCells={(task, handle) => {
                                  const norm = normalizeState(task.state);
                                  return (
                                    <>
                                      {taskSort === "priority" && (
                                        <TableCell className="py-1 align-middle">{handle}</TableCell>
                                      )}
                                      <TableCell className="font-mono text-xs text-muted-foreground">{task.id}</TableCell>
                                      <TableCell className="font-medium text-sm">{task.title}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-[10px]">{task.type}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <span
                                          className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                                          style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColorVar[norm] }} />
                                          {task.state}
                                        </span>
                                      </TableCell>
                                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={task.iterationPath || undefined}>
                                        {task.iterationPath || <span className="italic">—</span>}
                                      </TableCell>
                                      <TableCell>
                                        <PrioritySelect
                                          value={priorityLevelFor(task.id)}
                                          onChange={(level) => taskPriorities.setLevel(task.id, level)}
                                        />
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {task.assignee || <span className="text-muted-foreground italic">{t.unassigned}</span>}
                                      </TableCell>
                                      {source === "tfs" && tfsBaseUrl && (
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end gap-0.5">
                                            <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Abrir en Azure DevOps">
                                              <a
                                                href={`${tfsBaseUrl}/_workitems/edit/${task.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={`Abrir tarea ${task.id} en Azure DevOps`}
                                              >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                              </a>
                                            </Button>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7"
                                              title="Copiar enlace"
                                              aria-label={t.copyLinkTask.replace("{id}", task.id)}
                                              onClick={() => copyWorkItemLink(task.id, "tarea")}
                                            >
                                              <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      )}
                                    </>
                                  );
                                }}
                              />
                            );
                          })()}
                        </TableBody>
                      </Table>
                      {filteredTasks.length > 100 && (
                        <p className="text-xs text-muted-foreground text-center py-2 border-t">
                          {t.showingMaxOf.replace("{max}", "100").replace("{total}", String(filteredTasks.length))}
                        </p>
                      )}
                    </div>
                  )
                ) : tasksByPerson.length === 0 ? (
                  (() => {
                    const teamName = activeTeam !== "all" ? teams.find((tm) => tm.id === activeTeam)?.name : null;
                    const personName = activePerson !== "all" ? activePerson : null;
                    // Use the debounced value so the message matches the list.
                    const searchQuery = debouncedSearch.trim() || null;
                    const sub = (tpl: string) =>
                      tpl
                        .replace("{team}", teamName ?? "")
                        .replace("{person}", personName ?? "")
                        .replace("{q}", searchQuery ?? "");
                    let message = t.noPersonsMatching;
                    if (teamName && personName && searchQuery) {
                      message = sub(t.noTasksForTeamPersonAndSearch);
                    } else if (teamName && searchQuery) {
                      message = sub(t.noTasksForTeamAndSearch);
                    } else if (personName && searchQuery) {
                      message = sub(t.noTasksForPersonAndSearch);
                    } else if (teamName && personName) {
                      message = sub(t.noTasksForTeamAndPerson);
                    } else if (teamName) {
                      message = sub(t.noTasksForTeam);
                    } else if (personName) {
                      message = sub(t.noTasksForPerson);
                    } else if (searchQuery) {
                      message = sub(t.noTasksForSearch);
                    }
                    const hasActiveFilter = Boolean(teamName || personName || searchQuery);
                    const messageId = "tasks-by-person-empty-message";
                    return (
                      <div
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                        aria-labelledby={messageId}
                        className="flex flex-col items-center gap-3 py-10 text-center focus:outline-none"
                      >
                        <UserIcon
                          className="h-8 w-8 text-muted-foreground/60"
                          aria-hidden="true"
                          focusable="false"
                        />
                        <p id={messageId} className="text-sm text-muted-foreground max-w-md">
                          {message}
                        </p>
                        {hasActiveFilter && (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            aria-label={t.clearFiltersCta}
                            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={() => {
                              setSearchParams({});
                              setDraftTeam("all");
                              setDraftPerson("all");
                              setDraftSearch("");
                            }}
                          >
                            <X className="mr-1 h-4 w-4" aria-hidden="true" focusable="false" />
                            {t.clearFiltersCta}
                          </Button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <Accordion type="multiple" defaultValue={defaultOpenPeople} className="w-full">
                    {tasksByPerson.map((group) => {
                      const initials = group.person
                        .split(/\s+/)
                        .map((p) => p[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                      const items = [...group.active, ...group.pending, ...group.blocked, ...group.done].slice(0, 100);
                      return (
                        <AccordionItem key={group.person} value={group.person}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                                {group.person === t.unassigned ? <UserIcon className="h-4 w-4" /> : initials}
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <p className="text-sm font-medium truncate">{group.person}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {group.total} {group.total === 1 ? "tarea" : "tareas"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {group.active.length > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] gap-1"
                                    style={{ background: `${stateColorVar.active}20`, color: stateColorVar.active }}
                                  >
                                    <PlayCircle className="h-3 w-3" />
                                    {group.active.length} en progreso
                                  </Badge>
                                )}
                                {group.pending.length > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] gap-1"
                                    style={{ background: `${stateColorVar.pending}20`, color: stateColorVar.pending }}
                                  >
                                    <CircleDashed className="h-3 w-3" />
                                    {group.pending.length} pendientes
                                  </Badge>
                                )}
                                {group.blocked.length > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] gap-1"
                                    style={{ background: `${stateColorVar.blocked}20`, color: stateColorVar.blocked }}
                                  >
                                    <AlertOctagon className="h-3 w-3" />
                                    {group.blocked.length} bloqueadas
                                  </Badge>
                                )}
                                {group.done.length > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] gap-1"
                                    style={{ background: `${stateColorVar.done}20`, color: stateColorVar.done }}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    {group.done.length} hechas
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="mb-2 flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5"
                                onClick={() => setHandoverPerson(group.person)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Generar resumen de handover
                              </Button>
                            </div>
                            <div className="rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[60px]">#</TableHead>
                                    <TableHead>{t.title}</TableHead>
                                    <TableHead className="w-[100px]">Tipo</TableHead>
                                    <TableHead className="w-[140px]">Estado</TableHead>
                                    <TableHead className="w-[180px]">Iteración</TableHead>
                                    <TableHead className="w-[140px]">Prioridad</TableHead>
                                    <TableHead className="w-[120px] text-right">Handover</TableHead>
                                    {source === "tfs" && tfsBaseUrl && (
                                      <TableHead className="w-[90px] text-right">Acciones</TableHead>
                                    )}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map((t) => (
                                    <TaskRowWithHandover
                                      key={t.id}
                                      task={t}
                                      norm={normalizeState(t.state)}
                                      tfsBaseUrl={tfsBaseUrl}
                                      source={source}
                                      onCopyLink={copyWorkItemLink}
                                      priority={priorityLevelFor(t.id)}
                                      onPriorityChange={(level) => taskPriorities.setLevel(t.id, level)}
                                    />
                                  ))}
                                </TableBody>
                              </Table>
                              {group.total > 100 && (
                                <p className="text-xs text-muted-foreground text-center py-2 border-t">
                                  {t.showingMaxOf.replace("{max}", "100").replace("{total}", String(group.total))}
                                </p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
      )}

      {showWorkload && (
        <section className="space-y-6">
          <WorkloadMatrix tasks={tfsTasksRaw} showAllTasks={showAllWorkloadTasks} onShowAllTasksChange={setShowAllWorkloadTasks} />
        </section>
      )}

      {handoverPerson && (() => {
        const group = tasksByPerson.find((g) => g.person === handoverPerson);
        return (
          <HandoverSummaryDialog
            open={!!handoverPerson}
            onOpenChange={(o) => !o && setHandoverPerson(null)}
            person={handoverPerson}
            active={group?.active ?? []}
            pending={group?.pending ?? []}
            blocked={group?.blocked ?? []}
            tfsBaseUrl={tfsBaseUrl}
          />
        );
      })()}
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
  const { t } = useLang();
  const isAll = value === "all";
  const label = isAll ? t.allPersonsCount.replace("{count}", String(people.length)) : value;

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
          <CommandInput placeholder={t.searchPerson} />
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
                {t.allPersons}
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

interface TaskRowWithHandoverProps {
  task: UnifiedTask;
  norm: "active" | "pending" | "done" | "blocked";
  tfsBaseUrl: string | null;
  source: DataSource;
  onCopyLink: (id: string, type: "feature" | "tarea") => void;
  priority: PriorityLevel;
  onPriorityChange: (level: PriorityLevel) => void;
}

function TaskRowWithHandover({ task, norm, tfsBaseUrl, source, onCopyLink, priority, onPriorityChange }: TaskRowWithHandoverProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const showActions = source === "tfs" && !!tfsBaseUrl;
  const colSpan = 7 + (showActions ? 1 : 0);
  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">{task.id}</TableCell>
        <TableCell className="font-medium text-sm">{task.title}</TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px]">{task.type}</Badge>
        </TableCell>
        <TableCell>
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${stateColorVar[norm]}20`, color: stateColorVar[norm] }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColorVar[norm] }} />
            {task.state}
          </span>
        </TableCell>
        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={task.iterationPath || undefined}>
          {task.iterationPath || <span className="italic">—</span>}
        </TableCell>
        <TableCell>
          <PrioritySelect value={priority} onChange={onPriorityChange} />
        </TableCell>
        <TableCell className="text-right">
          <Button
            size="sm"
            variant={open ? "secondary" : "ghost"}
            className="h-7 gap-1 text-xs"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t.hideHandover : t.addHandover}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
            {open ? "Cerrar" : "Handover"}
          </Button>
        </TableCell>
        {showActions && (
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-0.5">
              <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Abrir en Azure DevOps">
                <a
                  href={`${tfsBaseUrl}/_workitems/edit/${task.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir tarea ${task.id} en Azure DevOps`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Copiar enlace"
                aria-label={t.copyLinkTask.replace("{id}", task.id)}
                onClick={() => onCopyLink(task.id, "tarea")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TableCell>
        )}
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={colSpan} className="bg-muted/10 p-3">
            <TaskHandoverNotes taskId={task.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

