import { useEffect, useMemo, useState } from "react";
import { Hourglass, Loader2, RefreshCw, ExternalLink, Search, UserX, Link2 } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Settings as SettingsIcon } from "lucide-react";
import { listTfsFeatures, listTfsTasks, RODAT_AREA_PATH, RODAT_ITERATION_PATH, type TfsWorkItem } from "@/services/tfs";
import { decryptPat } from "@/services/tfsPatVault";
import { parseTfsTags } from "@/lib/tfsTags";
import { cn } from "@/lib/utils";
import { isBugType, normalizeState } from "@/lib/tasksState";
import {
  extractWaitingDependency,
  groupWaitingItems,
  latestChangedDate,
  pathLeaf,
  NO_THEME_KEY,
  UNASSIGNED_KEY,
  type WaitingItem,
} from "@/lib/waitingGroups";

const formatDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatDateTime = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const isPathUnder = (path: string | undefined, root: string) =>
  Boolean(path && (path === root || path.startsWith(`${root}\\`)));

/**
 * Dedicated board listing only work items tagged as `waiting`, grouped by
 * developer and, inside each developer, by theme (parent feature, iteration
 * or area leaf).
 */
export const WaitingPage = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDevelopers, setOpenDevelopers] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    // Anonymous visitors can browse the view, but Azure DevOps data needs the
    // admin credentials. Expose the public config so item links still work.
    if (!user) {
      try {
        const publicConfig = await loadPublicAdoConfig();
        setBaseUrl(buildAdoBaseUrl(publicConfig?.serverUrl, publicConfig?.collection, publicConfig?.project));
        setError(t.errAdoSignInRequired);
      } finally {
        setLoading(false);
      }
      return;
    }
    try {

      const { data: settings } = await supabase
        .from("azure_devops_settings")
        .select("server_url, collection, project, team, pat_encrypted, pat_iv, area_paths, iteration_paths")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!settings?.server_url || !settings?.collection || !settings?.project || !settings?.pat_encrypted) {
        setError(t.errIncompleteAdoConfig);
        return;
      }
      let plainPat: string;
      try {
        plainPat = await decryptPat(settings.pat_encrypted, settings.pat_iv);
      } catch {
        setError(t.errIncompleteAdoConfig);
        return;
      }
      const conn = {
        serverUrl: settings.server_url,
        collection: settings.collection,
        project: settings.project,
        team: settings.team ?? undefined,
        pat: plainPat,
      };
      const cleanServer = settings.server_url.replace(/\/+$/, "");
      const cleanCollection = settings.collection.replace(/^\/+|\/+$/g, "");
      setBaseUrl(`${cleanServer}/${cleanCollection}/${encodeURIComponent(settings.project.replace(/^\/+|\/+$/g, ""))}`);

      const userAreas = (settings.area_paths ?? []).filter((p: string) => p && p.trim().length > 0);
      const userIters = (settings.iteration_paths ?? []).filter((p: string) => p && p.trim().length > 0);
      const effectiveAreas = userAreas.length > 0 ? userAreas : [RODAT_AREA_PATH];
      const effectiveIters = userIters.length > 0 ? userIters : [RODAT_ITERATION_PATH];

      const [featRes, taskRes] = await Promise.all([
        listTfsFeatures(conn, [], userAreas),
        listTfsTasks(conn, userAreas, userIters),
      ]);
      if (taskRes.error) {
        setError(taskRes.error.message);
        return;
      }
      const featureById = new Map<number, TfsWorkItem>();
      featRes.items.forEach((f) => featureById.set(f.id, f));

      const mapped: WaitingItem[] = taskRes.items
        .filter(
          (it) =>
            effectiveAreas.some((root: string) => isPathUnder(it.areaPath, root)) &&
            effectiveIters.some((root: string) => isPathUnder(it.iterationPath, root)),
        )
        .map((it) => {
          const parent = it.parentId !== undefined ? featureById.get(it.parentId) : undefined;
          const theme = parent?.title ?? pathLeaf(it.iterationPath) ?? pathLeaf(it.areaPath) ?? "";
          return {
            id: String(it.id),
            title: it.title,
            state: it.state,
            type: it.workItemType,
            assignee: it.assignedTo,
            theme,
            tags: parseTfsTags(it.tags),
            changedDate: it.changedDate,
          };
        });
      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? items.filter(
          (it) =>
            it.title.toLowerCase().includes(term) ||
            (it.assignee ?? "").toLowerCase().includes(term) ||
            it.theme.toLowerCase().includes(term) ||
            it.id.includes(term),
        )
      : items;
    return groupWaitingItems(filtered);
  }, [items, search]);

  const totalWaiting = useMemo(() => groups.reduce((acc, g) => acc + g.total, 0), [groups]);
  const themeCount = useMemo(
    () => new Set(groups.flatMap((g) => g.themes.map((th) => th.theme))).size,
    [groups],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-status-vacation" />
            {t.waitingViewTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t.waitingBadgeTooltip}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t.bugsRefresh}
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-2">
            <Link to="/settings/azure-devops">
              <SettingsIcon className="h-4 w-4" />
              Azure DevOps
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingItemsTotal}</CardDescription>
            <CardTitle className="text-2xl">{totalWaiting}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingDevelopersAffected}</CardDescription>
            <CardTitle className="text-2xl">{groups.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t.waitingThemesAffected}</CardDescription>
            <CardTitle className="text-2xl">{themeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.waitingSearchPlaceholder}
          className="pl-9"
        />
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!error && !loading && groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t.waitingEmptyState}
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" value={openDevelopers} onValueChange={setOpenDevelopers} className="space-y-3">
        {groups.map((group) => {
          const allItems = group.themes.flatMap((th) => th.items);
          const lastDate = formatDate(latestChangedDate(allItems));
          const developerLabel =
            group.developer === UNASSIGNED_KEY ? t.waitingUnassigned : group.developer;
          return (
            <AccordionItem key={group.developer} value={group.developer} className="border rounded-xl px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-2 pr-3 text-left">
                  {group.developer === UNASSIGNED_KEY && <UserX className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-medium">{developerLabel}</span>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="gap-1 border-status-vacation/40 bg-status-vacation/10 text-status-vacation"
                      >
                        <Hourglass className="h-3 w-3" />
                        {group.total}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs space-y-1">
                      <p>{t.waitingBadgeTooltip}</p>
                      <p className="text-muted-foreground">
                        {lastDate ? t.waitingSince.replace("{date}", lastDate) : t.waitingSinceUnknown}
                      </p>
                    </TooltipContent>
                  </UiTooltip>
                  <span className="text-xs text-muted-foreground">
                    {t.waitingThemesCount.replace("{n}", String(group.themes.length))}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                {group.themes.map((theme) => (
                  <div key={theme.theme} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {theme.theme === NO_THEME_KEY ? t.waitingNoTheme : theme.theme}
                      <span className="ml-2 font-normal normal-case tracking-normal">({theme.items.length})</span>
                    </h3>
                    <ul className="space-y-1.5">
                      {theme.items.map((item) => {
                        const itemDate = formatDateTime(item.changedDate);
                        const rawDate = item.changedDate;
                        const dependency = extractWaitingDependency(item.tags);
                        return (
                          <li
                            key={item.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2 text-sm"
                          >
                            <Badge variant="secondary" className="text-[10px]">
                              {isBugType(item.type) ? t.bugs : t.tasks}
                            </Badge>
                            <span className="flex-1 min-w-[12rem]">{item.title}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {normalizeState(item.state)}
                            </Badge>
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px]",
                                    dependency
                                      ? "border-status-vacation/40 bg-status-vacation/10 text-status-vacation"
                                      : "border-dashed text-muted-foreground italic",
                                  )}
                                >
                                  <Link2 className="h-3 w-3" />
                                  {dependency ?? t.waitingDependencyUnknown}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {dependency
                                  ? t.waitingDependencyTooltip.replace("{dependency}", dependency)
                                  : t.waitingDependencyUnknownTooltip}
                              </TooltipContent>
                            </UiTooltip>
                            {itemDate && (
                              <UiTooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground cursor-help">
                                    {t.waitingSince.replace("{date}", itemDate)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs space-y-1">
                                  <p>{t.waitingDateTooltip.replace("{field}", "changedDate").replace("{date}", rawDate ?? "")}</p>
                                </TooltipContent>
                              </UiTooltip>
                            )}
                            {baseUrl && (
                              <a
                                href={`${baseUrl}/_workitems/edit/${item.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`#${item.id}`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
