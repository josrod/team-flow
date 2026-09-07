import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useBacklogSync } from "@/hooks/use-backlog-sync";
import { buildAssigneeIndex, resolveMember } from "@/lib/assigneeMatch";
import { filterInternalMembers, filterInternalTeams } from "@/lib/internalTeams";
import {
  buildBacklogAlerts,
  groupAlertsByItem,
  type BacklogAlert,
  type BacklogAlertGroup,
  type BacklogAlertKind,
} from "@/lib/backlogAlerts";
import { BlockerGroupCard } from "@/components/blockers/BlockerGroupCard";
import { SuggestOwnerDialog } from "@/components/blockers/SuggestOwnerDialog";
import {
  deleteBlockerReview,
  listActiveBlockerReviews,
  saveBlockerReview,
  toReviewKeys,
  type BlockerReview,
} from "@/services/blockerReviewsService";

const KINDS: readonly BacklogAlertKind[] = [
  "unassignedItem",
  "unassignedChild",
  "absentOwner",
  "dependency",
];

export const BlockersPage = () => {
  const { t } = useLang();
  const { teams, members, absences } = useApp();
  const { isAdmin } = useAuth();
  const { cards, loading, error, reload } = useBacklogSync();

  const [reviews, setReviews] = useState<BlockerReview[]>([]);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<BacklogAlertKind | "all">("all");
  const [suggestFor, setSuggestFor] = useState<BacklogAlertGroup | null>(null);
  const [saving, setSaving] = useState(false);

  const loadReviews = useCallback(async () => {
    try {
      setReviews(await listActiveBlockerReviews());
      setReviewsError(null);
    } catch {
      setReviewsError(t.blockersError);
    }
  }, [t]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const internalTeams = useMemo(() => filterInternalTeams(teams), [teams]);
  const internalMembers = useMemo(
    () => filterInternalMembers(members, internalTeams),
    [members, internalTeams],
  );
  const assigneeIndex = useMemo(() => buildAssigneeIndex(internalMembers), [internalMembers]);

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

  const filtered = useMemo(
    () => (kindFilter === "all" ? alerts : alerts.filter((alert) => alert.kind === kindFilter)),
    [alerts, kindFilter],
  );
  const groups = useMemo(() => groupAlertsByItem(filtered), [filtered]);

  const suggestionByItem = useMemo(() => {
    const map = new Map<number, string>();
    reviews.forEach((review) => {
      if (!review.suggestedMemberId) return;
      const member = members.find((candidate) => candidate.id === review.suggestedMemberId);
      if (member) map.set(review.itemId, member.name);
    });
    return map;
  }, [reviews, members]);

  const kindLabels: Record<BacklogAlertKind, string> = {
    unassignedItem: t.backlogAlertUnassignedItem,
    unassignedChild: t.backlogAlertUnassignedChild,
    absentOwner: t.backlogAlertAbsentOwner,
    dependency: t.backlogAlertDependency,
  };

  const handleMarkReviewed = async (alert: BacklogAlert) => {
    if (!isAdmin) {
      toast.error(t.blockersAdminOnly);
      return;
    }
    try {
      const created = await saveBlockerReview({
        itemId: alert.itemId,
        kind: alert.kind,
        person: alert.person ?? null,
      });
      setReviews((current) => [created, ...current]);
      toast.success(t.blockersReviewedToast, {
        action: {
          label: t.blockersActionUndoReviewed,
          onClick: () => {
            void deleteBlockerReview(created.id).then(() => {
              setReviews((current) => current.filter((review) => review.id !== created.id));
              toast.success(t.blockersReviewedUndoToast);
            });
          },
        },
      });
    } catch {
      toast.error(t.blockersError);
    }
  };

  const handleSuggest = async ({ memberId, reason }: { memberId: string; reason: string }) => {
    if (!suggestFor) return;
    setSaving(true);
    try {
      const created = await saveBlockerReview({
        itemId: suggestFor.itemId,
        kind: "unassignedItem",
        suggestedMemberId: memberId,
        reason: reason || null,
        days: 30,
      });
      setReviews((current) => [created, ...current]);
      toast.success(t.blockersSuggestSaved);
      setSuggestFor(null);
    } catch {
      toast.error(t.blockersError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t.blockersTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.blockersSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(value as BacklogAlertKind | "all")}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t.blockersFilterKind} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.blockersFilterAll}</SelectItem>
              {KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kindLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => reload({ forceRefresh: true })} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t.backlogRefresh}
          </Button>
        </div>
      </header>

      {(error || reviewsError) && <p className="text-sm text-destructive">{error ?? reviewsError}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="font-display text-2xl font-semibold">{groups.length}</p>
            <p className="text-xs text-muted-foreground">{t.blockersItemsAffected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-display text-2xl font-semibold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">{t.blockersAlertsCount}</p>
          </CardContent>
        </Card>
      </div>

      {loading && cards.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t.blockersNone}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <BlockerGroupCard
              key={group.itemId}
              group={group}
              suggestion={suggestionByItem.get(group.itemId)}
              canAct={isAdmin}
              onSuggestOwner={setSuggestFor}
              onMarkReviewed={(alert) => void handleMarkReviewed(alert)}
            />
          ))}
        </div>
      )}

      <SuggestOwnerDialog
        open={suggestFor !== null}
        onOpenChange={(open) => !open && setSuggestFor(null)}
        itemLabel={suggestFor ? `#${suggestFor.itemId} ${suggestFor.title}` : ""}
        members={internalMembers}
        saving={saving}
        onSubmit={(input) => void handleSuggest(input)}
      />
    </div>
  );
};
