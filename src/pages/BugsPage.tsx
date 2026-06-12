import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bug, ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, Search, Settings } from "lucide-react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { BugDetailDialog } from "@/components/BugDetailDialog";
import { fetchTfsBugsByIterations, type TfsBug, type TfsError } from "@/services/tfs";

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
  const [state, setState] = useState<string>(ALL);
  const [iteration, setIteration] = useState<string>(ALL);
  const [selectedBug, setSelectedBug] = useState<TfsBug | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const loadBugs = useCallback(async () => {
    if (!settings || settings.iterationPaths.length === 0) return;
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
    );
    if (result.error) setError(result.error);
    setBugs(result.items);
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    if (settings && settings.iterationPaths.length > 0) loadBugs();
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

  const iterations = useMemo(() => {
    const set = new Set<string>();
    bugs.forEach((b) => b.iterationPath && set.add(b.iterationPath));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bugs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bugs.filter((b) => {
      if (assignee !== ALL && (b.assignedTo ?? t.bugsUnassigned) !== assignee) return false;
      if (state !== ALL && b.state !== state) return false;
      if (iteration !== ALL && (b.iterationPath ?? "") !== iteration) return false;
      if (q) {
        const haystack = `${b.id} ${b.title}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bugs, search, assignee, state, iteration, t.bugsUnassigned]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);
  const paginatedBugs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

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

  useEffect(() => {
    setPage(1);
  }, [search, assignee, state, iteration]);

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
          {(search.trim() || iteration !== ALL) && bugs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setIteration(ALL);
              }}
              className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
              title="Limpiar filtros"
            >
              {filtered.length} / {bugs.length}
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
                {filtered.length} / {bugs.length} {t.bugsCount}
              </CardTitle>
              <CardDescription>{settings.project}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
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
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t.bugsFilterAll}</SelectItem>
                      {states.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t.bugsEmpty}</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">{t.bugsColumnId}</TableHead>
                        <TableHead>{t.bugsColumnTitle}</TableHead>
                        <TableHead>{t.bugsColumnAssignee}</TableHead>
                        <TableHead>{t.bugsColumnState}</TableHead>
                        <TableHead>{t.bugsColumnIteration}</TableHead>
                        <TableHead>{t.bugsColumnArea}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((b) => (
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
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {b.iterationPath ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {b.areaPath ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
