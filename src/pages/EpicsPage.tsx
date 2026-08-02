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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { EpicDetailDrawer } from "@/components/EpicDetailDrawer";
import { EpicsTimeline } from "@/components/EpicsTimeline";
import { EpicsHeatmap } from "@/components/EpicsHeatmap";
import { decryptPat } from "@/services/tfsPatVault";
import { loadSharedAdoSettings } from "@/services/adoConfig";
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
import { useAuth } from "@/context/AuthContext";
import { useEpicVersions } from "@/hooks/use-epic-versions";
import { EpicVersionManager } from "@/components/EpicVersionManager";
import { EpicVersionLegend } from "@/components/EpicVersionLegend";
import { EpicVersionSelect } from "@/components/EpicVersionSelect";
import { epicVersionAccessibleLabel, resolveEpicVersionColor } from "@/lib/epicVersionColors";

interface EpicsSettings {
  serverUrl: string;
  collection: string;
  project: string;
  team?: string;
  pat: string;
  areaPaths: string[];
  epicsQueryId: string;
  epicsProject: string;
  epicsTeam: string;
  epicsAreaPaths: string[];
  epicsIterationPaths: string[];
  epicsTags: string[];
}

type ViewMode = "roadmap" | "timeline" | "heatmap" | "list";

const ALL = "__all__";
const NO_VERSION = "none";
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "roadmap";
    const stored = window.localStorage.getItem("epics-view-mode");
    if (stored === "roadmap" || stored === "list" || stored === "timeline" || stored === "heatmap") {
      return stored;
    }
    return "roadmap";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("epics-view-mode", viewMode);
    }
  }, [viewMode]);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>(ALL);
  const [selectedTags, setSelectedTags] = useState<string[]>(() =>
    parseTagsParam(searchParams.get("tags")),
  );
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false);

  const { isAdmin } = useAuth();
  const {
    versions,
    assignments,
    versionById,
    addVersion,
    editVersion,
    removeVersion,
    assignVersion,
  } = useEpicVersions();

  // Bulk version assignment from the list tab.
  const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);
  const [bulkVersionId, setBulkVersionId] = useState<string>(NO_VERSION);
  const [bulkSaving, setBulkSaving] = useState(false);

  const toggleEpicSelection = useCallback((epicId: string) => {
    setSelectedEpicIds((prev) =>
      prev.includes(epicId) ? prev.filter((id) => id !== epicId) : [...prev, epicId],
    );
  }, []);

  const applyBulkVersion = useCallback(async () => {
    if (selectedEpicIds.length === 0) return;
    setBulkSaving(true);
    try {
      const versionId = bulkVersionId === NO_VERSION ? null : bulkVersionId;
      for (const epicId of selectedEpicIds) {
        await assignVersion(epicId, versionId);
      }
      toast.success(t.epicsBulkApplied.replace("{count}", String(selectedEpicIds.length)));
      setSelectedEpicIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkSaving(false);
    }
  }, [assignVersion, bulkVersionId, selectedEpicIds, t.epicsBulkApplied]);

  // Version filter (?versions=id1,id2 — "none" targets epics without version).
  const [selectedVersions, setSelectedVersions] = useState<string[]>(() =>
    parseTagsParam(searchParams.get("versions")),
  );

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedVersions.length === 0) {
      if (!next.has("versions")) return;
      next.delete("versions");
    } else {
      const value = serializeTagsParam(selectedVersions);
      if (next.get("versions") === value) return;
      next.set("versions", value);
    }
    setSearchParams(next);
  }, [selectedVersions, searchParams, setSearchParams]);

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
      let data: Record<string, unknown> | null = null;
      if (user) {
        const { data: own } = await supabase
          .from("azure_devops_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        data = (own as Record<string, unknown> | null) ?? null;
      }
      // Visitors without an admin session read the shared configuration so the
      // data stays visible (read-only) inside the intranet.
      if (!data) {
        data = (await loadSharedAdoSettings()) as unknown as Record<string, unknown> | null;
      }
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
          epics_team?: string | null;
          epics_area_paths?: string[] | null;
          epics_iteration_paths?: string[] | null;
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
            epicsTeam: raw.epics_team ?? "",
            epicsAreaPaths: Array.isArray(raw.epics_area_paths) ? raw.epics_area_paths : [],
            epicsIterationPaths: Array.isArray(raw.epics_iteration_paths) ? raw.epics_iteration_paths : [],
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
  const effectiveTeam = useMemo(() => {
    if (!settings) return undefined;
    const overrideTeam = settings.epicsTeam.trim();
    if (overrideTeam) return overrideTeam;
    // Fall back to the main team only when the Epics project matches the
    // main project — a team from the main project is invalid under a
    // different project.
    return isEpicsProjectOverride ? undefined : settings.team;
  }, [settings, isEpicsProjectOverride]);
  const effectiveAreaPaths = useMemo(() => {
    if (!settings) return [] as string[];
    return settings.epicsAreaPaths.length > 0 ? settings.epicsAreaPaths : settings.areaPaths;
  }, [settings]);

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
        team: effectiveTeam,
        pat: settings.pat,
      },
      {
        queryId: settings.epicsQueryId,
        tags: settings.epicsTags,
        areaPaths: effectiveAreaPaths,
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
  }, [settings, effectiveProject, effectiveTeam, effectiveAreaPaths]);

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

  const versionOf = useCallback(
    (epic: TfsEpic) => {
      const id = assignments[String(epic.id)];
      return id ? versionById.get(id) ?? null : null;
    },
    [assignments, versionById],
  );

  const versionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    epics.forEach((e) => {
      const id = assignments[String(e.id)];
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [epics, assignments]);

  const noVersionCount = useMemo(
    () => epics.filter((e) => !assignments[String(e.id)]).length,
    [epics, assignments],
  );

  const [versionEditRequestId, setVersionEditRequestId] = useState<string | null>(null);

  const toggleVersionKey = useCallback((key: string) => {
    setSelectedVersions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  }, []);

  const requestVersionEdit = useCallback((id: string) => {
    setVersionEditRequestId(id);
    document.getElementById("epic-versions-manager")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagSet = new Set(selectedTags.map((t) => t.toLowerCase()));
    const versionSet = new Set(selectedVersions);
    return epics.filter((e) => {
      if (stateFilter !== ALL && e.state !== stateFilter) return false;
      if (tagSet.size > 0 && !e.tags.some((tg) => tagSet.has(tg.toLowerCase()))) return false;
      if (versionSet.size > 0) {
        const assigned = assignments[String(e.id)];
        const key = assigned ?? NO_VERSION;
        if (!versionSet.has(key)) return false;
      }
      if (!q) return true;
      return (
        String(e.id).includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.assignedTo?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [epics, search, stateFilter, selectedTags, selectedVersions, assignments]);

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
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>
                {t.epicsEffectiveProjectLabel}: <span className="font-medium">{effectiveProject}</span>
                {effectiveTeam ? (
                  <>
                    {" · "}
                    {t.epicsEffectiveTeamLabel}: <span className="font-medium">{effectiveTeam}</span>
                  </>
                ) : null}
              </span>
              {isEpicsProjectOverride ? (
                <Badge variant="outline" className="text-[10px]">{t.epicsEffectiveProjectOverride}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">{t.epicsEffectiveProjectMain}</Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div id="epic-versions-manager">
              <EpicVersionManager
                versions={versions}
                counts={versionCounts}
                canEdit={isAdmin}
                onAdd={addVersion}
                onEdit={editVersion}
                onRemove={removeVersion}
                editRequestId={versionEditRequestId}
                onEditRequestHandled={() => setVersionEditRequestId(null)}
              />
            </div>
            <EpicVersionLegend
              versions={versions}
              counts={versionCounts}
              noVersionCount={noVersionCount}
              canEdit={isAdmin}
              selected={selectedVersions}
              noVersionKey={NO_VERSION}
              onToggle={toggleVersionKey}
              onEditVersion={requestVersionEdit}
            />
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
              <div className="min-w-[200px]">
                <label className="text-xs text-muted-foreground">{t.epicsFilterVersions}</label>
                <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="mt-1 h-9 w-full justify-between font-normal"
                      disabled={versions.length === 0}
                    >
                      <span className="truncate text-left">
                        {selectedVersions.length === 0
                          ? t.epicsFilterVersionsPlaceholder
                          : `${selectedVersions.length} ${t.epicsFilterTagsSelected}`}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="flex items-center justify-end border-b px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedVersions([])}
                        disabled={selectedVersions.length === 0}
                      >
                        {t.epicsFilterClear}
                      </Button>
                    </div>
                    <div className="max-h-72 overflow-auto py-1">
                      {[...versions.map((v) => ({ key: v.id, label: v.name, colorKey: v.colorKey })),
                        { key: NO_VERSION, label: t.epicVersionNone, colorKey: null as string | null }].map((opt) => {
                        const selected = selectedVersions.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() =>
                              setSelectedVersions((prev) =>
                                prev.includes(opt.key)
                                  ? prev.filter((p) => p !== opt.key)
                                  : [...prev, opt.key],
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent",
                              selected && "bg-accent/50",
                            )}
                          >
                            <Check className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                            {opt.colorKey ? (
                              <span
                                className={cn(
                                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9px] leading-none text-primary-foreground",
                                  resolveEpicVersionColor(opt.colorKey).bar,
                                )}
                                aria-hidden
                              >
                                {resolveEpicVersionColor(opt.colorKey).symbol}
                              </span>
                            ) : (
                              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted-foreground/50 text-[9px] leading-none text-muted-foreground" aria-hidden>
                                –
                              </span>
                            )}
                            <span className="truncate">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-40 w-full" />
                <p className="text-xs text-muted-foreground text-center">{t.epicsLoading}</p>
              </div>
            ) : (
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as ViewMode)}
                className="w-full"
              >
                <TabsList>
                  <TabsTrigger value="roadmap">{t.epicsTabRoadmap}</TabsTrigger>
                  <TabsTrigger value="timeline">{t.epicsTabTimeline}</TabsTrigger>
                  <TabsTrigger value="heatmap">{t.epicsTabHeatmap}</TabsTrigger>
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
                                  bucketEpics.map((epic) => {
                                    const version = versionOf(epic);
                                    const color = version ? resolveEpicVersionColor(version.colorKey) : null;
                                    return (
                                    <div
                                      key={epic.id}
                                      className="relative overflow-hidden rounded-md border bg-background hover:border-primary hover:shadow-sm transition-all"
                                    >
                                      {color && (
                                        <span className={cn("absolute inset-y-0 left-0 w-1", color.stripe)} aria-hidden />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openEpic(epic)}
                                        className={cn("block w-full text-left p-2.5", color && "pl-3.5")}
                                      >
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="text-xs font-mono text-muted-foreground">#{epic.id}</span>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                      </div>
                                      <p className="text-sm font-medium leading-snug mt-1 line-clamp-2">{epic.title}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{epic.state}</Badge>
                                        {version && color && (
                                          <Badge
                                            variant="outline"
                                            className={cn("gap-1 text-[10px] px-1.5 py-0", color.badge)}
                                            title={epicVersionAccessibleLabel(version.name, version.colorKey)}
                                          >
                                            <span aria-hidden className="leading-none">{color.symbol}</span>
                                            {version.name}
                                          </Badge>
                                        )}
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
                                      {isAdmin && versions.length > 0 && (
                                        <div className={cn("px-2.5 pb-2.5", color && "pl-3.5")}>
                                          <EpicVersionSelect
                                            epicId={epic.id}
                                            versions={versions}
                                            versionId={assignments[String(epic.id)] ?? null}
                                            canEdit
                                            onAssign={assignVersion}
                                            className="w-full"
                                          />
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="timeline" className="mt-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t.epicsNoResults}</p>
                  ) : (
                    <EpicsTimeline
                      epics={filtered}
                      onOpenEpic={openEpic}
                      versionFor={(epic) => {
                        const version = versionOf(epic);
                        if (!version) return null;
                        const color = resolveEpicVersionColor(version.colorKey);
                        return {
                          name: version.name,
                          barClass: color.bar,
                          symbol: color.symbol,
                          colorName: color.colorName,
                        };
                      }}
                    />
                  )}
                </TabsContent>
                <TabsContent value="heatmap" className="mt-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t.epicsNoResults}</p>
                  ) : (
                    <EpicsHeatmap epics={filtered} onOpenEpic={openEpic} />
                  )}
                </TabsContent>
                <TabsContent value="list" className="mt-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">{t.epicsNoResults}</p>
                  ) : (
                    <div className="space-y-3">
                      {isAdmin && selectedEpicIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
                          <span className="text-xs font-medium">
                            {t.epicsBulkSelected.replace("{count}", String(selectedEpicIds.length))}
                          </span>
                          <Select value={bulkVersionId} onValueChange={setBulkVersionId}>
                            <SelectTrigger className="h-8 w-[180px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_VERSION}>{t.epicVersionNone}</SelectItem>
                              {versions.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8" onClick={applyBulkVersion} disabled={bulkSaving}>
                            {bulkSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {t.epicsBulkAssign}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() => setSelectedEpicIds([])}
                            disabled={bulkSaving}
                          >
                            {t.epicsBulkClear}
                          </Button>
                        </div>
                      )}
                      <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {isAdmin && (
                              <TableHead className="w-10">
                                <Checkbox
                                  aria-label={t.epicsBulkSelectAll}
                                  checked={
                                    filtered.length > 0 &&
                                    filtered.every((e) => selectedEpicIds.includes(String(e.id)))
                                  }
                                  onCheckedChange={(checked) =>
                                    setSelectedEpicIds(checked === true ? filtered.map((e) => String(e.id)) : [])
                                  }
                                />
                              </TableHead>
                            )}
                            <TableHead className="w-20">{t.epicsColId}</TableHead>
                            <TableHead>{t.epicsColTitle}</TableHead>
                            <TableHead>{t.epicsColState}</TableHead>
                            <TableHead>{t.epicsColAssignee}</TableHead>
                            <TableHead>{t.epicsColVersion}</TableHead>
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
                              {isAdmin && (
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    aria-label={`${t.epicsBulkSelectRow} #${epic.id}`}
                                    checked={selectedEpicIds.includes(String(epic.id))}
                                    onCheckedChange={() => toggleEpicSelection(String(epic.id))}
                                  />
                                </TableCell>
                              )}
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
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <EpicVersionSelect
                                  epicId={epic.id}
                                  versions={versions}
                                  versionId={assignments[String(epic.id)] ?? null}
                                  canEdit={isAdmin}
                                  onAssign={assignVersion}
                                />
                              </TableCell>
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
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <EpicDetailDrawer
        versions={versions}
        versionId={selectedEpic ? assignments[String(selectedEpic.id)] ?? null : null}
        canEditVersion={isAdmin}
        onAssignVersion={assignVersion}
        epic={selectedEpic}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        connection={
          settings
            ? {
                serverUrl: settings.serverUrl,
                collection: settings.collection,
                project: effectiveProject,
                team: effectiveTeam,
                pat: settings.pat,
              }
            : null
        }
      />
    </div>
  );
};

export default EpicsPage;
