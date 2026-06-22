import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Bug, Check, ChevronsUpDown, ExternalLink, Loader2, RefreshCw, Search, Settings, X } from "lucide-react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { BugDetailDialog } from "@/components/BugDetailDialog";
import { SeverityBadge, normalizeSeverity } from "@/components/SeverityBadge";
import { fetchTfsBugsByIterations, type TfsBug, type TfsError } from "@/services/tfs";
import { SortableRows } from "@/components/SortableRows";
import { PrioritySelect } from "@/components/PrioritySelect";
import { PriorityMenu } from "@/components/PriorityMenu";
import { useTaskPriorities } from "@/hooks/use-task-priorities";
import { sortByPriority, type PriorityLevel } from "@/lib/taskPriority";

interface AdoSettings {
  serverUrl: string;
  collection: string;
  project: string;
  team?: string;
  pat: string;
  iterationPaths: string[];
}

const ALL = "__all__";

export const BugsPage = () => {
  const { t } = useLang();

  const [settings, setSettings] = useState<AdoSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [bugs, setBugs] = useState<TfsBug[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TfsError | null>(null);

  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState<string>(ALL);
  const [state, setState] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string[]>([]);
  const [iteration, setIteration] = useState<string>(ALL);
  const [selectedBug, setSelectedBug] = useState<TfsBug | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const PAGE_SIZE = 30;
  const LOAD_MORE_TIMEOUT_MS = 5000;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(() => {
    const loadSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSettingsLoading(false);
        return;
      }
      const { data } = await supabase
        .from("azure_devops_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const raw = data as unknown as {
          server_url: string | null;
          collection: string | null;
          project: string;
          team: string | null;
          pat_encrypted: string;
          iteration_paths?: string[] | null;
        };
        setSettings({
          serverUrl: raw.server_url ?? "",
          collection: raw.collection ?? "",
          project: raw.project,
          team: raw.team ?? undefined,
          pat: raw.pat_encrypted,
          iterationPaths: Array.isArray(raw.iteration_paths) ? raw.iteration_paths : [],
        });
      }
      setSettingsLoading(false);
    };
    loadSettings();
  }, []);

  const loadBugsControllerRef = useRef<AbortController | null>(null);
  const loadBugsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LOAD_BUGS_TIMEOUT_MS = 20000;

  const loadBugs = useCallback(async () => {
    if (!settings || settings.iterationPaths.length === 0) return;
    // Cancel any in-flight request before starting a new one.
    loadBugsControllerRef.current?.abort();
    if (loadBugsTimeoutRef.current) clearTimeout(loadBugsTimeoutRef.current);
    const controller = new AbortController();
    loadBugsControllerRef.current = controller;
    loadBugsTimeoutRef.current = setTimeout(() => controller.abort(), LOAD_BUGS_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    const result = await fetchTfsBugsByIterations(
      {
        serverUrl: settings.serverUrl,
        collection: settings.collection,
        project: settings.project,
        team: settings.team,
        pat: settings.pat,
      },
      settings.iterationPaths,
      controller.signal,
    );
    if (loadBugsTimeoutRef.current) {
      clearTimeout(loadBugsTimeoutRef.current);
      loadBugsTimeoutRef.current = null;
    }
    // If a newer call superseded us, drop the stale result.
    if (loadBugsControllerRef.current !== controller) return;
    loadBugsControllerRef.current = null;
    if (result.error) setError(result.error);
    setBugs(result.items);
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    if (settings && settings.iterationPaths.length > 0) loadBugs();
    return () => {
      loadBugsControllerRef.current?.abort();
      loadBugsControllerRef.current = null;
      if (loadBugsTimeoutRef.current) {
        clearTimeout(loadBugsTimeoutRef.current);
        loadBugsTimeoutRef.current = null;
      }
    };
  }, [settings, loadBugs]);


  const assignees = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => set.add(b.assignedTo ?? t.bugsUnassigned));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bugs, t.bugsUnassigned]);

  const states = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => set.add(b.state));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bugs]);

  const severities = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => b.severity && set.add(b.severity));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bugs]);

  const iterations = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => b.iterationPath && set.add(b.iterationPath));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bugs]);

  const [sortColumn, setSortColumn] = useState<"id" | "title" | "assignedTo" | "state" | "severity" | "iterationPath">("severity");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [manualOrder, setManualOrder] = useState(false);

  // Per-developer drag & drop priority. Bucket key follows the active assignee
  // filter so each developer keeps their own ranking.
  const bugPriorities = useTaskPriorities();
  const bugBucketKey = assignee === ALL ? "__all__" : assignee;
  const bugPriorityMap = bugPriorities.mapFor(bugBucketKey);
  const bugPriorityLevel = (id: string): PriorityLevel =>
    bugPriorityMap[id]?.level ?? "medium";

  const severityWeight = (s?: string | null) => {
    const level = normalizeSeverity(s);
    switch (level) {
      case "critical": return 5;
      case "high": return 4;
      case "medium": return 3;
      case "low": return 2;
      case "trivial": return 1;
      default: return 0;
    }
  };


  const handleSort = (column: "id" | "title" | "assignedTo" | "state" | "severity" | "iterationPath") => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bugs.filter((b) => {
      if (assignee !== ALL && (b.assignedTo ?? t.bugsUnassigned) !== assignee) return false;
      if (state.length > 0 && !state.includes(b.state)) return false;
      if (severity.length > 0 && (!b.severity || !severity.includes(b.severity))) return false;
      if (iteration !== ALL && (b.iterationPath ?? "") !== iteration) return false;
      if (q) {
        const haystack = `${b.id} ${b.title}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bugs, search, assignee, state, severity, iteration, t.bugsUnassigned]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (manualOrder) {
      const idMap = new Map(arr.map((b) => [String(b.id), b]));
      const ordered = sortByPriority(
        arr.map((b) => ({ id: String(b.id) })),
        bugPriorityMap,
      );
      return ordered.map((o) => idMap.get(o.id)!).filter(Boolean);
    }
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "id":
          cmp = a.id - b.id;
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "assignedTo":
          cmp = (a.assignedTo ?? "").localeCompare(b.assignedTo ?? "");
          break;
        case "state":
          cmp = a.state.localeCompare(b.state);
          break;
        case "severity":
          cmp = severityWeight(a.severity) - severityWeight(b.severity);
          break;
        case "iterationPath":
          cmp = (a.iterationPath ?? "").localeCompare(b.iterationPath ?? "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortColumn, sortDirection, manualOrder, bugPriorityMap]);

  const visibleBugs = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const hasMore = visibleCount < sorted.length;

  const suggestions = useMemo(() => {
    const raw = search.trim();
    if (!raw) return [];
    const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const scored = bugs
      .filter((b) => {
        if (iteration !== ALL && (b.iterationPath ?? "") !== iteration) return false;
        const haystack = `${b.id} ${b.title}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .map((b) => {
        const haystack = `${b.id} ${b.title}`.toLowerCase();
        const fullQuery = raw.toLowerCase();
        let score = 0;
        if (haystack === fullQuery) score += 100;
        if (`${b.id}`.toLowerCase() === fullQuery) score += 90;
        if (b.title.toLowerCase() === fullQuery) score += 80;
        if (haystack.startsWith(fullQuery)) score += 50;
        if (`${b.id}`.toLowerCase().startsWith(fullQuery)) score += 40;
        if (b.title.toLowerCase().startsWith(fullQuery)) score += 30;
        words.forEach((w) => {
          if (`${b.id}`.toLowerCase().includes(w)) score += 5;
          if (b.title.toLowerCase().includes(w)) score += 3;
        });
        return { bug: b, score };
      });

    scored.sort((a, b) => b.score - a.score || a.bug.title.localeCompare(b.bug.title));
    return scored.slice(0, 8).map((s) => s.bug);
  }, [bugs, search, iteration]);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return text;
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const parts = text.split(pattern);
    return parts.map((part, i) =>
      words.some((w) => part.toLowerCase() === w) ? (
        <mark key={i} className="bg-primary/20 text-primary font-semibold rounded-sm px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  useEffect(() => {
    setHighlightIndex(0);
  }, [search, iteration]);

  const cancelLoadMore = useCallback(() => {
    if (loadMoreControllerRef.current) {
      loadMoreControllerRef.current.abort();
      loadMoreControllerRef.current = null;
    }
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current);
      loadMoreTimeoutRef.current = null;
    }
  }, []);

  const startLoadMore = useCallback(() => {
    cancelLoadMore();
    setLoadMoreError(false);
    setLoadingMore(true);
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    // Watchdog: if the load does not complete in time, abort the controller
    // (cancelling any in-flight work that subscribes to the signal).
    loadMoreTimeoutRef.current = setTimeout(() => {
      loadMoreTimeoutRef.current = null;
      controller.abort();
      if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
      setLoadingMore(false);
      setLoadMoreError(true);
    }, LOAD_MORE_TIMEOUT_MS);
    // Async work that respects the abort signal — bail out cleanly on cancel.
    const run = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 400);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
        if (controller.signal.aborted) return;
        if (loadMoreTimeoutRef.current) {
          clearTimeout(loadMoreTimeoutRef.current);
          loadMoreTimeoutRef.current = null;
        }
        if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
        setVisibleCount((c) => Math.min(c + PAGE_SIZE, sorted.length));
      } catch {
        // Aborted — state is handled by the watchdog or cancelLoadMore.
      }
    };
    void run();
  }, [cancelLoadMore, sorted.length]);


  useEffect(() => {
    const hadInFlightLoadBugs = loadBugsControllerRef.current !== null;
    if (hadInFlightLoadBugs) {
      loadBugsControllerRef.current?.abort();
      loadBugsControllerRef.current = null;
    }
    if (loadBugsTimeoutRef.current) {
      clearTimeout(loadBugsTimeoutRef.current);
      loadBugsTimeoutRef.current = null;
    }
    if (hadInFlightLoadBugs) setLoading(false);
    cancelLoadMore();
    setLoadingMore(false);
    setLoadMoreError(false);
    setVisibleCount(PAGE_SIZE);
  }, [search, assignee, state, severity, iteration, bugs, cancelLoadMore]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        try {
          if (entries.some((e) => e.isIntersecting) && !loadingMore && !loadMoreError) {
            startLoadMore();
          }
        } catch {
          cancelLoadMore();
          setLoadingMore(false);
          setLoadMoreError(true);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, loadMoreError, startLoadMore, cancelLoadMore]);

  const retryLoadMore = useCallback(() => {
    setLoadMoreError(false);
    if (hasMore) startLoadMore();
  }, [hasMore, startLoadMore]);

  useEffect(() => {
    setLoadingMore(false);
  }, [visibleCount]);

  useEffect(() => () => cancelLoadMore(), [cancelLoadMore]);


  const openBug = (b: TfsBug) => {
    setSelectedBug(b);
    setDetailOpen(true);
    setSuggestionsOpen(false);
  };

  const renderEmptyState = (message: string) => (
    <Card>
      <CardContent className="py-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button asChild variant="outline">
          <Link to="/settings/azure-devops">
            <Settings className="h-4 w-4 mr-2" />
            {t.bugsOpenSettings}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight flex items-center gap-2">
            <Bug className="h-7 w-7" />
            {t.bugsPageTitle}
          </h1>
          <p className="text-muted-foreground mt-1">{t.bugsPageDescription}</p>
          {settings && settings.iterationPaths.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t.bugsIterationPathsLabel}:</span>
              {settings.iterationPaths.map((path) => {
                const isActive = iteration === path;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setIteration(isActive ? ALL : path)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                    title={isActive ? "Quitar filtro" : "Filtrar por esta iteración"}
                  >
                    {path}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(search.trim() || iteration !== ALL || state.length > 0 || severity.length > 0) && bugs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setIteration(ALL);
                setState([]);
                setSeverity([]);
              }}
              className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
              title="Limpiar filtros"
            >
              {sorted.length} / {bugs.length}
            </button>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (!suggestionsOpen || suggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const pick = suggestions[highlightIndex];
                  if (pick) openBug(pick);
                } else if (e.key === "Escape") {
                  setSuggestionsOpen(false);
                }
              }}
              placeholder="Buscar por título o ID..."
              className="pl-9 w-64"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden">
                <ul className="max-h-72 overflow-auto py-1">
                  {suggestions.map((b, idx) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openBug(b);
                        }}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors",
                          idx === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                        )}
                      >
                        <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">{highlightMatch(String(b.id), search)}</span>
                        <span className="truncate">{highlightMatch(b.title, search)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {iteration !== ALL && (
                  <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground font-mono truncate">
                    {iteration}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button onClick={loadBugs} disabled={loading || !settings || settings.iterationPaths.length === 0} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {t.bugsRefresh}
          </Button>
        </div>
      </div>

      {settingsLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !settings ? (
        renderEmptyState(t.bugsNoConnection)
      ) : settings.iterationPaths.length === 0 ? (
        renderEmptyState(t.bugsNoIterationConfigured)
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">
                {sorted.length} / {bugs.length} {t.bugsCount}
              </CardTitle>
              <CardDescription>{settings.project}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label className="text-xs text-muted-foreground">{t.bugsFilterAssignee}</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t.bugsFilterAll}</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t.bugsFilterState}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between mt-1 font-normal">
                        <span className="truncate">
                          {state.length === 0
                            ? t.bugsFilterAll
                            : `${state.length} seleccionado${state.length === 1 ? "" : "s"}`}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="max-h-72 overflow-auto py-1">
                        {states.map((s) => {
                          const selected = state.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setState(selected ? state.filter((x) => x !== s) : [...state, s])
                              }
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent",
                                selected && "bg-accent/50",
                              )}
                            >
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span>{s}</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {state.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {state.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 text-[11px]">
                          {s}
                          <button
                            type="button"
                            onClick={() => setState(state.filter((x) => x !== s))}
                            className="ml-0.5 hover:text-destructive"
                            aria-label={`Quitar ${s}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t.bugsFilterSeverity}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between mt-1 font-normal">
                        <span className="truncate">
                          {severity.length === 0
                            ? t.bugsFilterAll
                            : `${severity.length} seleccionado${severity.length === 1 ? "" : "s"}`}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="max-h-72 overflow-auto py-1">
                        {severities.map((s) => {
                          const selected = severity.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setSeverity(selected ? severity.filter((x) => x !== s) : [...severity, s])
                              }
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent",
                                selected && "bg-accent/50",
                              )}
                            >
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span>{s}</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {severity.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {severity.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1 text-[11px]">
                          {s}
                          <button
                            type="button"
                            onClick={() => setSeverity(severity.filter((x) => x !== s))}
                            className="ml-0.5 hover:text-destructive"
                            aria-label={`Quitar ${s}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t.bugsFilterIteration}</Label>
                  <Select value={iteration} onValueChange={setIteration}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t.bugsFilterAll}</SelectItem>
                      {iterations.map((i) => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {error && <TfsErrorPanel error={error} />}

              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <p className="text-xs text-muted-foreground text-center">{t.bugsLoading}</p>
                </div>
              ) : sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t.bugsEmpty}</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20 cursor-pointer select-none" onClick={() => handleSort("id")}>
                            <span className="inline-flex items-center">{t.bugsColumnId}<SortIcon column="id" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("title")}>
                            <span className="inline-flex items-center">{t.bugsColumnTitle}<SortIcon column="title" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("assignedTo")}>
                            <span className="inline-flex items-center">{t.bugsColumnAssignee}<SortIcon column="assignedTo" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("state")}>
                            <span className="inline-flex items-center">{t.bugsColumnState}<SortIcon column="state" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("severity")}>
                            <span className="inline-flex items-center">{t.bugsColumnSeverity}<SortIcon column="severity" /></span>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("iterationPath")}>
                            <span className="inline-flex items-center">{t.bugsColumnIteration}<SortIcon column="iterationPath" /></span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleBugs.map((b) => (
                          <TableRow
                            key={b.id}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelectedBug(b);
                              setDetailOpen(true);
                            }}
                          >
                            <TableCell className="font-mono text-xs">
                              <a
                                href={b.htmlUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {b.id}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </TableCell>
                            <TableCell className="max-w-md">
                              <span title={b.title}>{b.title}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {b.assignedTo ?? (
                                <span className="text-muted-foreground italic">{t.bugsUnassigned}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{b.state}</Badge>
                            </TableCell>
                            <TableCell>
                              <SeverityBadge severity={b.severity} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {b.iterationPath ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {loadingMore &&
                          Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={`skel-${i}`}>
                              <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-full max-w-xs" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div ref={sentinelRef} className="flex items-center justify-center py-3 text-xs">
                    {loadMoreError ? (
                      <div className="inline-flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span>{t.bugsLoadMoreError}</span>
                        <button
                          type="button"
                          onClick={retryLoadMore}
                          className="ml-1 inline-flex items-center gap-1 underline hover:text-destructive/80 cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t.bugsLoadMoreRetry}
                        </button>
                      </div>
                    ) : loadingMore ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t.bugsLoadingMore}
                      </span>
                    ) : hasMore ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t.bugsPaginationShowing
                          .replace("{from}", "1")
                          .replace("{to}", String(visibleBugs.length))
                          .replace("{total}", String(sorted.length))}
                      </span>
                    ) : (
                      sorted.length > PAGE_SIZE && (
                        <span className="text-muted-foreground">
                          {t.bugsPaginationShowing
                            .replace("{from}", "1")
                            .replace("{to}", String(sorted.length))
                            .replace("{total}", String(sorted.length))}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <BugDetailDialog
        bug={selectedBug}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        connection={settings}
      />
    </div>
  );
};

export default BugsPage;
