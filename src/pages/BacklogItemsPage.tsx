import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, KanbanSquare, Loader2, RefreshCw, Search, Settings, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { useLang } from "@/context/LanguageContext";
import { useApp } from "@/context/AppContext";
import { useBacklogSync } from "@/hooks/use-backlog-sync";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";
import { filterInternalMembers, filterInternalTeams } from "@/lib/internalTeams";
import { BacklogBoard } from "@/components/backlog/BacklogBoard";
import { BacklogByPerson } from "@/components/backlog/BacklogByPerson";
import type { BacklogCardItem } from "@/lib/backlogBoard";

const ALL = "__all__";
const VIEW_KEY = "rosen.backlogView.v1";

type BacklogView = "board" | "person";

const BacklogItemsPage = () => {
  const { t } = useLang();
  const { teams, members } = useApp();
  const { cards, loading, error, reload } = useBacklogSync();

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

  if (!loading && cards.length === 0 && error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
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
          <Button variant="outline" size="sm" onClick={() => reload({ forceRefresh: true })} disabled={loading}>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

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
