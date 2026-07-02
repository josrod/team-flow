import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, ChevronsUpDown, ExternalLink, Loader2, RefreshCw, Search, Settings, Target, X } from "lucide-react";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { EpicDetailDrawer } from "@/components/EpicDetailDrawer";
import { decryptPat } from "@/services/tfsPatVault";
import { fetchTfsEpics, type TfsEpic, type TfsError } from "@/services/tfs";
import {
  bucketForDate,
  compareBuckets,
  ensureUpcomingQuarters,
  NO_DATE_BUCKET,
  parseBucketId,
  quarterLabel,
  quarterRange,
  type QuarterBucket,
} from "@/lib/quarters";
import { uniqueTags } from "@/lib/tfsTags";
import { parseTagsParam, pruneUnknownTags, serializeTagsParam } from "@/lib/epicsTagsParam";

interface EpicsSettings {
  serverUrl: string;
  collection: string;
  project: string;
  team?: string;
  pat: string;
  areaPaths: string[];
  epicsQueryId: string;
  epicsProject: string;
  epicsTags: string[];
}

const ALL = "__all__";
const LOAD_EPICS_TIMEOUT_MS = 20000;

const formatDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const initialsOf = (name?: string): string => {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
};

export const EpicsPage = () => {
  const { t } = useLang();

  const [settings, setSettings] = useState<EpicsSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [epics, setEpics] = useState<TfsEpic[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEpic, setSelectedEpic] = useState<TfsEpic | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openEpic = useCallback((epic: TfsEpic) => {
    setSelectedEpic(epic);
    setDetailOpen(true);
  }, []);
  const [error, setError] = useState<TfsError | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>(ALL);
  const [selectedTags, setSelectedTags] = useState<string[]>(() =>
    parseTagsParam(searchParams.get("tags")),
  );
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  // Sync selectedTags → URL (?tags=a,b,c). Removes the param when empty.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedTags.length === 0) {
      if (!next.has("tags")) return;
      next.delete("tags");
    } else {
      const value = serializeTagsParam(selectedTags);
      if (next.get("tags") === value) return;
      next.set("tags", value);
    }
    setSearchParams(next);
  }, [selectedTags, searchParams, setSearchParams]);

  // Restore from URL when user navigates back/forward. Tolerates empty
  // values, extra commas, and duplicates via parseTagsParam.
  useEffect(() => {
    const fromUrl = parseTagsParam(searchParams.get("tags"));
    setSelectedTags((prev) => {
      if (prev.length === fromUrl.length && prev.every((t, i) => t === fromUrl[i])) return prev;
      return fromUrl;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("tags")]);

  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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
          pat_iv: string | null;
          area_paths?: string[] | null;
          epics_query_id?: string | null;
          epics_project?: string | null;
          epics_tags?: string[] | null;
        };
        try {
          const plainPat = await decryptPat(raw.pat_encrypted, raw.pat_iv);
          setSettings({
            serverUrl: raw.server_url ?? "",
            collection: raw.collection ?? "",
            project: raw.project,
            team: raw.team ?? undefined,
            pat: plainPat,
            areaPaths: Array.isArray(raw.area_paths) ? raw.area_paths : [],
            epicsQueryId: raw.epics_query_id ?? "",
            epicsProject: raw.epics_project ?? "",
            epicsTags: Array.isArray(raw.epics_tags) ? raw.epics_tags : [],
          });
        } catch {
          setSettings(null);
        }
      }
      setSettingsLoading(false);
    };
    loadSettings();
  }, []);

  const loadControllerRef = useRef<AbortController | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveProject = useMemo(
    () => settings?.epicsProject.trim() || settings?.project || "",
    [settings],
  );
  const isEpicsProjectOverride = useMemo(
    () => Boolean(settings?.epicsProject.trim() && settings?.epicsProject.trim() !== settings?.project),
    [settings],
  );

  const loadEpics = useCallback(async () => {
    if (!settings) return;
    loadControllerRef.current?.abort();
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    const controller = new AbortController();
    loadControllerRef.current = controller;
    loadTimeoutRef.current = setTimeout(() => controller.abort(), LOAD_EPICS_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    const result = await fetchTfsEpics(
      {
        serverUrl: settings.serverUrl,
        collection: settings.collection,
        project: effectiveProject,
        team: settings.team,
        pat: settings.pat,
      },
      {
        queryId: settings.epicsQueryId,
        tags: settings.epicsTags,
        areaPaths: settings.areaPaths,
      },
      controller.signal,
    );
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (loadControllerRef.current !== controller) return;
    loadControllerRef.current = null;
    if (result.error) setError(result.error);
    setEpics(result.items);
    setLoading(false);
  }, [settings, effectiveProject]);

  useEffect(() => {
    if (settings && settings.epicsTags.length > 0) loadEpics();
    return () => {
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [settings, loadEpics]);

  const availableStates = useMemo(() => {
    const s = new Set<string>();
    epics.forEach((e) => s.add(e.state));
    return Array.from(s).sort();
  }, [epics]);

  const availableTags = useMemo(() => uniqueTags(epics), [epics]);

  // Prune tags that no longer exist in the dataset once epics finish loading.
  useEffect(() => {
    if (loading || epics.length === 0) return;
    setSelectedTags((prev) => pruneUnknownTags(prev, availableTags));
  }, [availableTags, loading, epics.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagSet = new Set(selectedTags.map((t) => t.toLowerCase()));
    return epics.filter((e) => {
      if (stateFilter !== ALL && e.state !== stateFilter) return false;
      if (tagSet.size > 0 && !e.tags.some((tg) => tagSet.has(tg.toLowerCase()))) return false;
      if (!q) return true;
      return (
        String(e.id).includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.assignedTo?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [epics, search, stateFilter, selectedTags]);

  const grouped = useMemo(() => {
    const map = new Map<QuarterBucket, TfsEpic[]>();
    filtered.forEach((epic) => {
      const key = bucketForDate(epic.targetDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(epic);
    });
    map.forEach((list) => list.sort((a, b) => {
      const da = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
      const db = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
      if (da !== db) return da - db;
      return a.title.localeCompare(b.title);
    }));
    const keys = ensureUpcomingQuarters(Array.from(map.keys()), new Date(), 3);
    // Guarantee no-date bucket appears at the end if any epic has no date.
    if (filtered.some((e) => !e.targetDate) && !keys.includes(NO_DATE_BUCKET)) {
      keys.push(NO_DATE_BUCKET);
    }
    return keys.sort(compareBuckets).map((key) => ({ key, epics: map.get(key) ?? [] }));
  }, [filtered]);

  const renderEmpty = (message: string) => (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings/azure-devops">
            <Settings className="h-4 w-4 mr-2" />
            {t.epicsOpenSettings}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );

  if (settingsLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!settings) return <div className="p-6">{renderEmpty(t.epicsEmptyNoSettings)}</div>;
  if (settings.epicsTags.length === 0) return <div className="p-6">{renderEmpty(t.epicsEmptyNoTags)}</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            {t.epicsPageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{t.epicsPageDescription}</p>
          {settings.epicsTags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t.epicsTagsConfiguredLabel}:</span>
              {settings.epicsTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[11px]">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.epicsFilterSearch}
              className="pl-9 w-64"
            />
          </div>
          <Button onClick={loadEpics} disabled={loading} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {t.epicsRefresh}
          </Button>
        </div>
      </div>

      {error && <TfsErrorPanel error={error} />}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">
              {filtered.length} / {epics.length} {t.epicsCount}
            </CardTitle>
            <CardDescription>{settings.project}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[160px]">
                <label className="text-xs text-muted-foreground">{t.epicsFilterState}</label>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value={ALL}>{t.epicsFilterAll}</option>
                  {availableStates.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="min-w-[220px] flex-1 max-w-sm">
                <label className="text-xs text-muted-foreground">{t.epicsFilterTags}</label>
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="mt-1 h-9 w-full justify-between font-normal"
                      disabled={availableTags.length === 0}
                    >
                      <span className="truncate text-left">
                        {selectedTags.length === 0
                          ? t.epicsFilterTagsPlaceholder
                          : `${selectedTags.length} ${t.epicsFilterTagsSelected}`}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        {selectedTags.length} / {availableTags.length}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedTags([])}
                        disabled={selectedTags.length === 0}
                      >
                        {t.epicsFilterClear}
                      </Button>
                    </div>
                    <div className="max-h-72 overflow-auto py-1">
                      {availableTags.map((tg) => {
                        const selected = selectedTags.includes(tg);
                        return (
                          <button
                            key={tg}
                            type="button"
                            onClick={() =>
                              setSelectedTags((prev) =>
                                prev.includes(tg) ? prev.filter((p) => p !== tg) : [...prev, tg],
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent",
                              selected && "bg-accent/50",
                            )}
                          >
                            <Check className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{tg}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedTags.map((tg) => (
                      <Badge key={tg} variant="secondary" className="gap-1 text-[11px]">
                        {tg}
                        <button
                          type="button"
                          onClick={() => setSelectedTags((prev) => prev.filter((p) => p !== tg))}
                          className="ml-0.5 hover:text-destructive"
                          aria-label={`Remove ${tg}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-40 w-full" />
                <p className="text-xs text-muted-foreground text-center">{t.epicsLoading}</p>
              </div>
            ) : (
              <Tabs defaultValue="roadmap" className="w-full">
                <TabsList>
                  <TabsTrigger value="roadmap">{t.epicsTabRoadmap}</TabsTrigger>
                  <TabsTrigger value="list">{t.epicsTabList}</TabsTrigger>
                </TabsList>
                <TabsContent value="roadmap" className="mt-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t.epicsNoResults}</p>
                  ) : (
                    <div className="overflow-x-auto pb-2">
                      <div className="flex gap-3 min-w-max">
                        {grouped.map(({ key, epics: bucketEpics }) => {
                          const parsed = parseBucketId(key);
                          const label = parsed ? quarterLabel(parsed) : t.epicsNoDateBucket;
                          const range = parsed ? quarterRange(parsed) : null;
                          return (
                            <div key={key} className="w-72 shrink-0 rounded-lg border bg-muted/20 flex flex-col">
                              <div className="px-3 py-2 border-b bg-muted/40 rounded-t-lg">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-sm font-semibold">{label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {bucketEpics.length} {t.epicsQuarterEpicsSuffix}
                                  </span>
                                </div>
                                {range && (
                                  <p className="text-[11px] text-muted-foreground font-mono">
                                    {formatDate(range.start.toISOString())} – {formatDate(range.end.toISOString())}
                                  </p>
                                )}
                              </div>
                              <div className="p-2 space-y-2 min-h-[80px]">
                                {bucketEpics.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">—</p>
                                ) : (
                                  bucketEpics.map((epic) => (
                                    <button
                                      key={epic.id}
                                      type="button"
                                      onClick={() => openEpic(epic)}
                                      className="block w-full text-left rounded-md border bg-background p-2.5 hover:border-primary hover:shadow-sm transition-all"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="text-xs font-mono text-muted-foreground">#{epic.id}</span>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                      </div>
                                      <p className="text-sm font-medium leading-snug mt-1 line-clamp-2">{epic.title}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{epic.state}</Badge>
                                        {epic.tags.slice(0, 3).map((tag) => (
                                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                                        ))}
                                      </div>
                                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                                            {initialsOf(epic.assignedTo)}
                                          </span>
                                          <span className="truncate max-w-[120px]">
                                            {epic.assignedTo ?? t.epicsUnassigned}
                                          </span>
                                        </span>
                                        <span className="font-mono">{formatDate(epic.targetDate)}</span>
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="list" className="mt-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t.epicsNoResults}</p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">{t.epicsColId}</TableHead>
                            <TableHead>{t.epicsColTitle}</TableHead>
                            <TableHead>{t.epicsColState}</TableHead>
                            <TableHead>{t.epicsColAssignee}</TableHead>
                            <TableHead>{t.epicsColTags}</TableHead>
                            <TableHead>{t.epicsColArea}</TableHead>
                            <TableHead>{t.epicsColTargetDate}</TableHead>
                            <TableHead>{t.epicsColChangedDate}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((epic) => (
                            <TableRow
                              key={epic.id}
                              className="hover:bg-muted/50 cursor-pointer"
                              onClick={() => openEpic(epic)}
                            >
                              <TableCell className="font-mono text-xs">
                                <a
                                  href={epic.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    window.open(epic.htmlUrl, "_blank", "noopener,noreferrer");
                                  }}
                                  className="inline-flex items-center gap-1 hover:underline text-primary"
                                >
                                  #{epic.id}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </TableCell>
                              <TableCell className="font-medium">{epic.title}</TableCell>
                              <TableCell><Badge variant="outline">{epic.state}</Badge></TableCell>
                              <TableCell className="text-sm">{epic.assignedTo ?? <span className="text-muted-foreground">{t.epicsUnassigned}</span>}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {epic.tags.map((tg) => (
                                    <Badge key={tg} variant="secondary" className="text-[10px]">{tg}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className={cn("text-xs font-mono text-muted-foreground max-w-[220px] truncate")}>
                                {epic.areaPath ?? "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{formatDate(epic.targetDate)}</TableCell>
                              <TableCell className="font-mono text-xs">{formatDate(epic.changedDate)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <EpicDetailDrawer
        epic={selectedEpic}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        connection={
          settings
            ? {
                serverUrl: settings.serverUrl,
                collection: settings.collection,
                project: settings.epicsProject.trim() || settings.project,
                team: settings.team,
                pat: settings.pat,
              }
            : null
        }
      />
    </div>
  );
};

export default EpicsPage;
