import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, KanbanSquare, Loader2, RefreshCw, Search, Settings, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { TfsErrorPanel } from "@/components/TfsErrorPanel";
import { decryptPat } from "@/services/tfsPatVault";
import { loadSharedAdoSettings } from "@/services/adoConfig";
import { listTfsBacklogItems, listTfsChildTasks, type TfsConnection, type TfsError } from "@/services/tfs";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";
import { filterInternalMembers, filterInternalTeams } from "@/lib/internalTeams";
import { BacklogBoard } from "@/components/backlog/BacklogBoard";
import { BacklogByPerson } from "@/components/backlog/BacklogByPerson";
import { buildBacklogCards, isRecentlyClosed, type BacklogCardItem } from "@/lib/backlogBoard";

const ALL = "__all__";
const VIEW_KEY = "rosen.backlogView.v1";

type BacklogView = "board" | "person";

interface BacklogSettings {
  conn: TfsConnection;
  areaPaths: string[];
  iterationPaths: string[];
  baseUrl: string;
}

const buildBaseUrl = (conn: TfsConnection): string => {
  const server = conn.serverUrl.replace(/\/+$/, "");
  const collection = conn.collection.trim();
  const project = conn.project.trim();
  return [server, collection, project].filter(Boolean).join("/");
};

const BacklogItemsPage = () => {
  const { t } = useLang();
  const { teams, members } = useApp();

  const [settings, setSettings] = useState<BacklogSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [cards, setCards] = useState<BacklogCardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TfsError | null>(null);

  const [view, setView] = useState<BacklogView>(() =>
    (localStorage.getItem(VIEW_KEY) as BacklogView | null) === "person" ? "person" : "board",
  );
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<string>(ALL);
  const [person, setPerson] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [tag, setTag] = useState<string>(ALL);
  const [waitingOnly, setWaitingOnly] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    const loadSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let data: Record<string, unknown> | null = null;
      if (user) {
        const { data: own } = await supabase
          .from("azure_devops_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        data = (own as Record<string, unknown> | null) ?? null;
      }
      // Visitors without an admin session read the shared read-only configuration.
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
          iteration_paths?: string[] | null;
        };
        try {
          const plainPat = await decryptPat(raw.pat_encrypted, raw.pat_iv);
          const conn: TfsConnection = {
            serverUrl: raw.server_url ?? "",
            collection: raw.collection ?? "",
            project: raw.project,
            team: raw.team ?? undefined,
            pat: plainPat,
          };
          setSettings({
            conn,
            areaPaths: Array.isArray(raw.area_paths) ? raw.area_paths : [],
            iterationPaths: Array.isArray(raw.iteration_paths) ? raw.iteration_paths : [],
            baseUrl: buildBaseUrl(conn),
          });
        } catch {
          setSettings(null);
        }
      }
      setSettingsLoading(false);
    };
    loadSettings();
  }, []);

  const loadBacklog = useCallback(
    async (opts: { forceRefresh?: boolean } = {}) => {
      if (!settings) return;
      setLoading(true);
      setError(null);
      const itemsResult = await listTfsBacklogItems(
        settings.conn,
        { areaPaths: settings.areaPaths, iterationPaths: settings.iterationPaths },
        { forceRefresh: opts.forceRefresh },
      );
      if (itemsResult.error) {
        setError(itemsResult.error);
        setCards([]);
        setLoading(false);
        return;
      }
      // Closed items are only relevant inside the recent window.
      const visible = itemsResult.items.filter(
        (item) => item.state.toLowerCase().includes("closed") === false || isRecentlyClosed(item),
      );
      const childResult = await listTfsChildTasks(
        settings.conn,
        visible.map((item) => item.id),
        { forceRefresh: opts.forceRefresh },
      );
      if (childResult.error) setError(childResult.error);
      setCards(buildBacklogCards(visible, childResult.items, settings.baseUrl));
      setLoading(false);
    },
    [settings],
  );

  useEffect(() => {
    if (settings) loadBacklog();
  }, [settings, loadBacklog]);

  const internalTeams = useMemo(() => filterInternalTeams(teams), [teams]);
  const internalMembers = useMemo(
    () => filterInternalMembers(members, internalTeams),
    [members, internalTeams],
  );
  const assigneeIndex = useMemo(() => buildAssigneeIndex(internalMembers), [internalMembers]);

  const teamIdForCard = useCallback(
    (card: BacklogCardItem): string | undefined =>
      resolveMember(card.assignedTo, card.assignedToEmail, assigneeIndex)?.teamId,
    [assigneeIndex],
  );

  const people = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((card) => {
      if (card.assignedTo?.trim()) set.add(card.assignedTo.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const types = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((card) => card.workItemType && set.add(card.workItemType));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((card) => card.tags.forEach((tagName) => set.add(tagName)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (team !== ALL && teamIdForCard(card) !== team) return false;
      if (person !== ALL && (card.assignedTo?.trim() ?? "") !== person) return false;
      if (type !== ALL && card.workItemType !== type) return false;
      if (tag !== ALL && !card.tags.includes(tag)) return false;
      if (waitingOnly && !card.waiting) return false;
      if (term) {
        const haystack = [String(card.id), card.title, card.assignedTo ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [cards, search, team, person, type, tag, waitingOnly, teamIdForCard]);

  if (settingsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t.backlogNoConnection}</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/azure-devops">
                <Settings className="mr-2 h-4 w-4" />
                Azure DevOps
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t.backlogTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.backlogSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <Button
              variant={view === "board" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("board")}
              className="gap-1.5"
            >
              <KanbanSquare className="h-4 w-4" />
              {t.backlogViewBoard}
            </Button>
            <Button
              variant={view === "person" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("person")}
              className="gap-1.5"
            >
              <Users className="h-4 w-4" />
              {t.backlogViewPerson}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadBacklog({ forceRefresh: true })} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t.backlogRefresh}
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Label className="text-xs">{t.backlogSearch}</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.backlogSearch}
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t.backlogFilterTeam}</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.backlogFilterAll}</SelectItem>
                {internalTeams.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t.backlogFilterPerson}</Label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.backlogFilterAll}</SelectItem>
                {people.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t.backlogFilterType}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.backlogFilterAll}</SelectItem>
                {types.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t.backlogFilterTag}</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t.backlogFilterAll}</SelectItem>
                {tags.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 xl:col-span-6">
            <Checkbox
              id="backlog-waiting"
              checked={waitingOnly}
              onCheckedChange={(checked) => setWaitingOnly(checked === true)}
            />
            <Label htmlFor="backlog-waiting" className="text-xs font-normal">
              {t.backlogWaitingOnly}
            </Label>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} {t.backlogItemsCount}
            </span>
          </div>
        </CardContent>
      </Card>

      {error && <TfsErrorPanel error={error} />}

      {loading && cards.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.backlogLoading}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t.backlogEmpty}</p>
      ) : view === "board" ? (
        <BacklogBoard cards={filtered} />
      ) : (
        <BacklogByPerson cards={filtered} />
      )}
    </div>
  );
};

export default BacklogItemsPage;
