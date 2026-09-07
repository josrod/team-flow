import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { useApp } from "@/context/AppContext";
import { useLang } from "@/context/LanguageContext";
import { useBacklogSync } from "@/hooks/use-backlog-sync";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";
import { buildBacklogAlerts } from "@/lib/backlogAlerts";
import { filterInternalMembers, filterInternalTeams } from "@/lib/internalTeams";
import { formatIsoDay } from "@/lib/inventValues";
import { currentIsoWeekKey, previousIsoWeekKey } from "@/lib/isoWeek";
import { buildPersonPanel, sortPersonRows, type PersonPanelSort } from "@/lib/personPanel";
import { PersonKpiCards } from "@/components/person-panel/PersonKpiCards";
import { PersonPanelTable } from "@/components/person-panel/PersonPanelTable";
import { BacklogDetailDialog } from "@/components/backlog/BacklogDetailDialog";
import { fetchTimeBookings, type TimeBooking } from "@/services/timeBookingService";
import { listActiveBlockerReviews, toReviewKeys } from "@/services/blockerReviewsService";
import type { BacklogCardItem } from "@/lib/backlogBoard";
import type { BlockerReview } from "@/services/blockerReviewsService";

const WEEK_OPTIONS = 8;

/** Panel with one row per person: TFS work, progress, hours, absences, blockers. */
export function PersonPanelPage() {
  const { t } = useLang();
  const { teams, members, absences } = useApp();
  const { cards, loading, error, lastSyncedAt, reload } = useBacklogSync();

  const [bookings, setBookings] = useState<TimeBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [reviews, setReviews] = useState<BlockerReview[]>([]);
  const [weekKey, setWeekKey] = useState(() => currentIsoWeekKey());
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sort, setSort] = useState<PersonPanelSort>("risk");
  const [selectedCard, setSelectedCard] = useState<BacklogCardItem | null>(null);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      setBookings(await fetchTimeBookings());
    } catch (loadError) {
      toast.error(t.timeBookingLoadError, {
        description: loadError instanceof Error ? loadError.message : undefined,
      });
    } finally {
      setBookingsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    let active = true;
    void listActiveBlockerReviews()
      .then((list) => {
        if (active) setReviews(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const internalTeams = useMemo(() => filterInternalTeams(teams), [teams]);
  const internalMembers = useMemo(
    () => filterInternalMembers(members, internalTeams),
    [members, internalTeams],
  );
  const assigneeIndex = useMemo(() => buildAssigneeIndex(internalMembers), [internalMembers]);
  const memberIdFor = useCallback(
    (person: string) => resolveMember(person, undefined, assigneeIndex)?.id ?? null,
    [assigneeIndex],
  );

  const alerts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return buildBacklogAlerts(cards, {
      reviewed: toReviewKeys(reviews),
      absenceFor: (person) => {
        const member = resolveMember(person, undefined, assigneeIndex);
        if (!member) return undefined;
        const active = absences.find(
          (absence) =>
            absence.memberId === member.id && absence.startDate <= today && absence.endDate >= today,
        );
        return active ? { type: active.type, until: active.endDate } : undefined;
      },
    });
  }, [cards, reviews, assigneeIndex, absences]);

  const panel = useMemo(
    () =>
      buildPersonPanel({
        members: internalMembers.map((member) => ({
          id: member.id,
          name: member.name,
          teamId: member.teamId,
        })),
        cards,
        alerts,
        bookings,
        absences,
        weekKey,
        memberIdFor,
      }),
    [internalMembers, cards, alerts, bookings, absences, weekKey, memberIdFor],
  );

  const rows = useMemo(() => {
    const filtered =
      teamFilter === "all" ? panel.rows : panel.rows.filter((row) => row.teamId === teamFilter);
    return sortPersonRows(filtered, sort);
  }, [panel.rows, teamFilter, sort]);

  const weekOptions = useMemo(() => {
    const keys: string[] = [];
    let key = currentIsoWeekKey();
    for (let index = 0; index < WEEK_OPTIONS; index += 1) {
      keys.push(key);
      key = previousIsoWeekKey(key);
    }
    return keys;
  }, []);

  const teamNameById = useMemo(
    () => Object.fromEntries(teams.map((team) => [team.id, team.name])),
    [teams],
  );

  const isLoading = loading || bookingsLoading;

  return (
    <div className="space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <Users className="h-5 w-5 text-primary" aria-hidden />
            {t.personPanelTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.personPanelSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={weekKey} onValueChange={setWeekKey}>
            <SelectTrigger className="w-[180px]" aria-label={t.personPanelWeek}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekOptions.map((option, index) => (
                <SelectItem key={option} value={option}>
                  {index === 0 ? `${option} · ${t.personPanelWeekCurrent}` : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[170px]" aria-label={t.personPanelTeamAll}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.personPanelTeamAll}</SelectItem>
              {internalTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as PersonPanelSort)}>
            <SelectTrigger className="w-[210px]" aria-label={t.personPanelSortLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="risk">{t.personPanelSortRisk}</SelectItem>
              <SelectItem value="progress">{t.personPanelSortProgress}</SelectItem>
              <SelectItem value="hours">{t.personPanelSortHours}</SelectItem>
              <SelectItem value="blockers">{t.personPanelSortBlockers}</SelectItem>
              <SelectItem value="name">{t.personPanelSortName}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void reload({ forceRefresh: true });
              void loadBookings();
            }}
            disabled={isLoading}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
            {t.backlogRefresh}
          </Button>
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        {t.personPanelWeekRange
          .replace("{from}", formatIsoDay(panel.weekFrom))
          .replace("{to}", formatIsoDay(panel.weekTo))}
        {" · "}
        {t.personPanelHint}
        {lastSyncedAt && ` · ${lastSyncedAt.toLocaleTimeString()}`}
      </p>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-status-sick">{error}</CardContent>
        </Card>
      )}

      <PersonKpiCards kpis={panel.kpis} />

      {isLoading && rows.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <PersonPanelTable
          rows={rows}
          teamNameById={teamNameById}
          onSelectCard={setSelectedCard}
        />
      )}

      <BacklogDetailDialog
        card={selectedCard}
        open={selectedCard !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
      />
    </div>
  );
}
