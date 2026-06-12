import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bug, ExternalLink, Loader2, RefreshCw, Search, Settings } from "lucide-react";
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título o ID..."
              className="pl-9 w-64"
            />
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
